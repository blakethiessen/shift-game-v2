import { describe, it, expect, vi } from 'vitest';
import {
  DIM_WIDTH_TILES,
  DIM_HEIGHT_TILES,
  Direction,
  GameState,
  GridCell,
  PlayerState,
  RenderOptions,
  WorldGridState,
  WorldType,
  createDefaultLobbyConfig,
} from '../../src/shared/types';
import {
  clampPopupBoxPosition,
  formatPopupText,
  computeFloatingInventoryPosition,
  computeFinalRoomConvergenceAlpha,
  computeCameraViewport,
  MIN_CAMERA_ZOOM,
  MAX_CAMERA_ZOOM,
  GameRenderer,
} from '../../src/renderer/gameRenderer';

function createEmptyCell(): GridCell {
  return {
    floorGid: 1,
    wallGid: 0,
    wallOverlayGid: 0,
    wallDoorGid: 0,
    holeGid: 0,
    obstacleGids: [],
    fakePlateGid: 0,
    synthesizedGhostWall: false,
    collides: false,
    noLight: false,
    isHole: false,
    isWallDoor: false,
    hasSwooshTrigger: false,
  };
}

function createWorldGrid(world: WorldType): WorldGridState {
  const cells: GridCell[][] = [];
  for (let x = 0; x < DIM_WIDTH_TILES; x++) {
    cells[x] = [];
    for (let y = 0; y < DIM_HEIGHT_TILES; y++) {
      cells[x][y] = createEmptyCell();
    }
  }
  return {
    world,
    cells,
    doors: [],
    boxes: [],
    lamps: [],
    evilLamps: [],
    pressurePlates: [],
    levers: [],
    chests: [],
    safes: [],
    fires: [],
    statues: [],
    books: [],
    items: [],
    blobbies: [],
  };
}

function createPlayer(id: 1 | 2, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    side: id === 1 ? 'left' : 'right',
    x: 225,
    y: 300,
    velocity: { x: 0, y: 0 },
    direction: Direction.Down,
    flashLightDir: Direction.Down,
    speed: 2,
    healthState: 'Normal',
    isAlive: true,
    isMoving: false,
    boxColliding: false,
    regenTimerMs: 0,
    inventory: [],
    currentItemIndex: 0,
    inventoryDisplayTimerMs: 0,
    flashlightMode: 'none',
    attackState: {
      active: false,
      weapon: null,
      timerMs: 0,
      direction: Direction.Down,
      hasDealtKnockback: false,
    },
    interactingObjectId: null,
    activePopupText: null,
    popupFaceDirection: Direction.Down,
    atDoorId: null,
    ping: null,
    ...overrides,
  };
}

function createMockGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    tick: 10,
    nextEventId: 1,
    rngState: 12345,
    roomName: 'spawnRoom',
    roomsEntered: 1,
    evilOnLeft: false,
    currentlyShifting: false,
    shiftTimerMs: 0,
    shiftCooldownMs: 0,
    shiftRequest: {
      requestedBy: null,
      remainingMs: 0,
      willHitWallForP1: false,
      willHitWallForP2: false,
    },
    convergenceDistance: 5,
    safePressurePlatesPressed: 0,
    isPaused: false,
    phase: 'playing',
    phaseTimerMs: 0,
    lobbyConfig: createDefaultLobbyConfig(),
    room: {
      roomName: 'spawnRoom',
      worlds: {
        neutral: createWorldGrid('neutral'),
        dangerous: createWorldGrid('dangerous'),
      },
      tears: [],
      pendingRegrowths: [],
      blobbySpawnTimerMs: 0,
      chestPressurePlatesToPress: 0,
      chestPressurePlatesPressed: 0,
      swooshTriggered: false,
    },
    players: [createPlayer(1), createPlayer(2)],
    persistence: {},
    events: [],
    ...overrides,
  };
}

function createMockCanvasAndCtx() {
  const fillTextCalls: Array<{ text: string; x: number; y: number }> = [];
  const drawImageCalls: unknown[][] = [];

  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000000' as string | CanvasGradient,
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '12px FixedSys',
    textAlign: 'center',
    textBaseline: 'middle',
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn((text: string, x: number, y: number) => {
      fillTextCalls.push({ text, x, y });
    }),
    drawImage: vi.fn((...args: unknown[]) => {
      drawImageCalls.push(args);
    }),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    fillTextCalls,
    drawImageCalls,
  };

  const canvas = {
    width: 1000,
    height: 650,
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;

  return { canvas, ctx };
}

describe('gameRenderer', () => {
  describe('Pure layout & formatting helpers', () => {
    it('clamps popup text box (120px wide) strictly inside the 0..500 x 0..650 local viewport', () => {
      // Near left edge
      const leftPos = clampPopupBoxPosition(10, 100, Direction.Left, 120, 60);
      expect(leftPos.x).toBeGreaterThanOrEqual(4);
      expect(leftPos.x + 120).toBeLessThanOrEqual(500);

      // Near right edge (would bleed into right half if unclamped!)
      const rightPos = clampPopupBoxPosition(475, 100, Direction.Right, 120, 60);
      expect(rightPos.x + 120).toBeLessThanOrEqual(500);
      expect(rightPos.x).toBeGreaterThanOrEqual(0);

      // Near top and bottom edges
      const topPos = clampPopupBoxPosition(250, 5, Direction.Up, 120, 60);
      expect(topPos.y).toBeGreaterThanOrEqual(4);
      const bottomPos = clampPopupBoxPosition(250, 640, Direction.Down, 120, 60);
      expect(bottomPos.y + 60).toBeLessThanOrEqual(650);
    });

    it('substitutes dynamic key labels in book/tutorial popup text', () => {
      const keyStrings: RenderOptions['keyStrings'] = {
        p1: {
          Up: 'W',
          Down: 'S',
          Left: 'A',
          Right: 'D',
          UseItem: 'Q',
          Interact: '1',
          Inventory: '2',
          Ping: 'C',
        },
        p2: {
          Up: 'UP',
          Down: 'DOWN',
          Left: 'LEFT',
          Right: 'RIGHT',
          UseItem: "'",
          Interact: ']',
          Inventory: '[',
          Ping: '/',
        },
        common: {
          SwitchDimensions: 'SHIFT',
          Pause: 'P',
          Mute: 'M',
        },
      };

      const raw =
        'Pick it up by interacting with it and pressing “Q” or “,” when the text appears. “E” or “.” will eat it.';
      const formatted = formatPopupText(raw, keyStrings);
      expect(formatted).toContain('1');
      expect(formatted).toContain(']');
      expect(formatted).toContain('Q');
      expect(formatted).toContain("'");
    });

    it('renders floating inventory icon at y - 25, or y + 25 when player.y < 25', () => {
      expect(computeFloatingInventoryPosition(200, 100)).toEqual({ x: 200, y: 75 });
      expect(computeFloatingInventoryPosition(200, 0)).toEqual({ x: 200, y: 25 });
      expect(computeFloatingInventoryPosition(200, 20)).toEqual({ x: 200, y: 45 });
    });

    it('computes Final Room convergence alpha in Online Mode when roomName === possibleFinalRoom and y > 300', () => {
      const stateAtEntrance = createMockGameState({
        roomName: 'possibleFinalRoom',
        players: [
          createPlayer(1, { x: 125, y: 50 }),
          createPlayer(2, { x: 350, y: 50 }),
        ],
      });
      expect(computeFinalRoomConvergenceAlpha(stateAtEntrance, 'online')).toBe(0);

      const stateConverging = createMockGameState({
        roomName: 'possibleFinalRoom',
        players: [
          createPlayer(1, { x: 450, y: 500 }),
          createPlayer(2, { x: 25, y: 500 }),
        ],
      });
      const alpha = computeFinalRoomConvergenceAlpha(stateConverging, 'online');
      expect(alpha).toBeGreaterThan(0.5);
      expect(alpha).toBeLessThanOrEqual(1);
    });

    it('computes zoomed camera viewport centered on player and clamped to 500x650 room boundaries', () => {
      // Default 1x zoom shows full 500x650 room
      const full = computeCameraViewport(225, 300, 1.0);
      expect(full).toEqual({
        zoom: 1,
        viewWidth: 500,
        viewHeight: 650,
        camX: 0,
        camY: 0,
      });

      // 2x zoom -> 250x325 visible area centered on player center (225 + 12.5 = 237.5, 300 + 12.5 = 312.5)
      const zoom2x = computeCameraViewport(225, 300, 2.0);
      expect(zoom2x.zoom).toBe(2);
      expect(zoom2x.viewWidth).toBe(250);
      expect(zoom2x.viewHeight).toBe(325);
      expect(zoom2x.camX).toBeCloseTo(237.5 - 125, 4);
      expect(zoom2x.camY).toBeCloseTo(312.5 - 162.5, 4);

      // Near top-left corner (0, 0) -> clamps camX=0, camY=0
      const topLeft = computeCameraViewport(0, 0, 2.0);
      expect(topLeft.camX).toBe(0);
      expect(topLeft.camY).toBe(0);

      // Near bottom-right corner (475, 625) -> clamps camX = 500 - 250 = 250, camY = 650 - 325 = 325
      const bottomRight = computeCameraViewport(475, 625, 2.0);
      expect(bottomRight.camX).toBe(250);
      expect(bottomRight.camY).toBe(325);

      // Clamps zoom to [MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM]
      expect(computeCameraViewport(200, 200, 0.25).zoom).toBe(MIN_CAMERA_ZOOM);
      expect(computeCameraViewport(200, 200, 10).zoom).toBe(MAX_CAMERA_ZOOM);

      // Clamps popup box inside zoomed camera viewport so it never clips off zoomed screen
      const cam = computeCameraViewport(225, 300, 2.0);
      const popupRight = clampPopupBoxPosition(340, 300, Direction.Right, 120, 60, cam);
      expect(popupRight.x + 120).toBeLessThanOrEqual(cam.camX + cam.viewWidth);
      expect(popupRight.x).toBeGreaterThanOrEqual(cam.camX);
    });
  });

  describe('Dual Viewport Modes (Local 1000x650 vs Online 500x650)', () => {
    it('resizes canvas to 1000x650 in local mode and 500x650 in online mode', () => {
      const { canvas } = createMockCanvasAndCtx();
      const offscreenFactory = () => createMockCanvasAndCtx().canvas;
      const renderer = new GameRenderer(
        canvas,
        {} as CanvasImageSource,
        offscreenFactory
      );

      renderer.resizeForMode('online');
      expect(canvas.width).toBe(500);
      expect(canvas.height).toBe(650);

      renderer.resizeForMode('local');
      expect(canvas.width).toBe(1000);
      expect(canvas.height).toBe(650);
    });

    it('draws only the local player side in online mode, and blends both in possibleFinalRoom when y > 300', () => {
      const { canvas, ctx } = createMockCanvasAndCtx();
      const offscreenFactory = () => createMockCanvasAndCtx().canvas;
      const renderer = new GameRenderer(
        canvas,
        {} as CanvasImageSource,
        offscreenFactory
      );

      const state = createMockGameState({
        roomName: 'possibleFinalRoom',
        players: [
          createPlayer(1, { x: 450, y: 550 }),
          createPlayer(2, { x: 25, y: 550 }),
        ],
      });

      renderer.render(
        state,
        {
          localPlayerId: 1,
          mode: 'online',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        16.67
      );

      expect(canvas.width).toBe(500);
      expect(canvas.height).toBe(650);
      // Should have rendered tiles and both players converging
      expect(ctx.drawImageCalls.length).toBeGreaterThan(0);
    });

    it('applies per-dimension camera zoom scaling and translation centered on each player when cameraZoom > 1', () => {
      const { canvas, ctx } = createMockCanvasAndCtx();
      const offscreenFactory = () => createMockCanvasAndCtx().canvas;
      const renderer = new GameRenderer(
        canvas,
        {} as CanvasImageSource,
        offscreenFactory
      );

      const state = createMockGameState({
        players: [
          createPlayer(1, { x: 225, y: 300, activePopupText: 'Zoomed popup text' }),
          createPlayer(2, { x: 400, y: 500 }),
        ],
      });

      renderer.render(
        state,
        {
          localPlayerId: 1,
          mode: 'local',
          partnerVisibility: 'strict',
          lightingEnabled: true,
          cameraZoom: 2.0,
        },
        16.67
      );

      // Both left and right viewports should scale by (2, 2) and translate by (-camX, -camY)
      expect(ctx.scale).toHaveBeenCalledWith(2, 2);
      const cam1 = computeCameraViewport(225, 300, 2.0);
      const cam2 = computeCameraViewport(400, 500, 2.0);
      expect(ctx.translate).toHaveBeenCalledWith(-cam1.camX, -cam1.camY);
      expect(ctx.translate).toHaveBeenCalledWith(-cam2.camX, -cam2.camY);
    });

    it('keeps multi-line book popups and off-camera partner pings unclipped in screen space at 4.0x max zoom', () => {
      const { canvas, ctx } = createMockCanvasAndCtx();
      const offscreenFactory = () => createMockCanvasAndCtx().canvas;
      const renderer = new GameRenderer(
        canvas,
        {} as CanvasImageSource,
        offscreenFactory
      );

      const longBookText =
        'Read all the books before leaving the spawn room if you want to live and survive the monsters in the dark dimension.';
      const state = createMockGameState({
        players: [
          createPlayer(1, {
            x: 10,
            y: 10,
            activePopupText: longBookText,
            popupFaceDirection: Direction.Up,
          }),
          createPlayer(2, {
            x: 450,
            y: 600,
            ping: {
              active: true,
              x: 450,
              y: 600,
              kind: 'action',
              remainingMs: 2000,
            },
          }),
        ],
      });

      renderer.render(
        state,
        {
          localPlayerId: 1,
          mode: 'online',
          partnerVisibility: 'strict',
          lightingEnabled: false,
          cameraZoom: 4.0,
        },
        16.67
      );

      // Off-camera partner ping at (450, 600) while P1 is at (10, 10) at 4x zoom
      // should be clamped inside the 500x650 viewport with at least 28px margin
      const actionCall = ctx.fillTextCalls.find((c) => c.text === 'ACTION');
      expect(actionCall).toBeDefined();
      expect(actionCall!.x).toBeGreaterThanOrEqual(28);
      expect(actionCall!.x).toBeLessThanOrEqual(500 - 28);
      expect(actionCall!.y).toBeGreaterThanOrEqual(14);
      expect(actionCall!.y).toBeLessThanOrEqual(650 - 14);
      expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]);
    });
  });

  describe('Horror & Online Co-op Overlays', () => {
    it('does not render red damage vignette at spawn when players are at Normal health (even when convergenceDistance === 0), and renders pulsing red vignette when damaged (Bruised, Injured, Dying)', () => {
      const { canvas, ctx } = createMockCanvasAndCtx();
      const offscreenFactory = () => createMockCanvasAndCtx().canvas;
      const renderer = new GameRenderer(
        canvas,
        {} as CanvasImageSource,
        offscreenFactory
      );

      // At initial spawn, both players are at (225, 325) with Normal health and convergenceDistance === 0
      const healthySpawnState = createMockGameState({
        convergenceDistance: 0,
        players: [
          createPlayer(1, { x: 225, y: 325, healthState: 'Normal', speed: 2.0 }),
          createPlayer(2, { x: 225, y: 325, healthState: 'Normal', speed: 2.0 }),
        ],
      });

      renderer.render(
        healthySpawnState,
        {
          localPlayerId: 1,
          mode: 'local',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        16.67
      );

      expect(ctx.createRadialGradient).not.toHaveBeenCalled();
      expect(ctx.arc).not.toHaveBeenCalled();

      // When a player is damaged (Bruised, Injured, Dying), red vignette renders
      const bruisedState = createMockGameState({
        players: [
          createPlayer(1, { x: 100, y: 200, healthState: 'Bruised', speed: 1.5 }),
          createPlayer(2, { x: 300, y: 200, healthState: 'Normal', speed: 2.0 }),
        ],
      });
      renderer.render(
        bruisedState,
        {
          localPlayerId: 1,
          mode: 'local',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        16.67
      );
      expect(ctx.createRadialGradient).toHaveBeenCalledTimes(1);

      const injuredState = createMockGameState({
        convergenceDistance: 8,
        players: [
          createPlayer(1, { x: 100, y: 200, healthState: 'Injured', speed: 1.0 }),
          createPlayer(2, { x: 300, y: 200, healthState: 'Normal', speed: 2.0 }),
        ],
      });
      renderer.render(
        injuredState,
        {
          localPlayerId: 1,
          mode: 'local',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        16.67
      );
      expect(ctx.createRadialGradient).toHaveBeenCalledTimes(2);

      // In online mode, partner being Injured does not render vignette on healthy local player's screen
      ctx.createRadialGradient.mockClear();
      renderer.render(
        injuredState,
        {
          localPlayerId: 2,
          mode: 'online',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        16.67
      );
      expect(ctx.createRadialGradient).not.toHaveBeenCalled();

      // When local player in online mode is Dying, vignette renders
      const dyingOnlineState = createMockGameState({
        players: [
          createPlayer(1, { x: 100, y: 200, healthState: 'Normal', speed: 2.0 }),
          createPlayer(2, { x: 300, y: 200, healthState: 'Dying', speed: 0.6 }),
        ],
      });
      renderer.render(
        dyingOnlineState,
        {
          localPlayerId: 2,
          mode: 'online',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        16.67
      );
      expect(ctx.createRadialGradient).toHaveBeenCalledTimes(1);

      // When players are dead (isAlive: false during 'dying' phase), continuous damage vignette stops
      ctx.createRadialGradient.mockClear();
      const deadState = createMockGameState({
        phase: 'dying',
        players: [
          createPlayer(1, { healthState: 'Dying', isAlive: false }),
          createPlayer(2, { healthState: 'Dying', isAlive: false }),
        ],
      });
      renderer.render(
        deadState,
        {
          localPlayerId: 1,
          mode: 'local',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        16.67
      );
      expect(ctx.createRadialGradient).not.toHaveBeenCalled();
    });

    it('renders Cooperative Shift HUD banner, countdown bar, and wall collision hazard warning', () => {
      const { canvas, ctx } = createMockCanvasAndCtx();
      const offscreenFactory = () => createMockCanvasAndCtx().canvas;
      const renderer = new GameRenderer(
        canvas,
        {} as CanvasImageSource,
        offscreenFactory
      );

      const state = createMockGameState({
        shiftRequest: {
          requestedBy: 2,
          remainingMs: 2500,
          willHitWallForP1: true,
          willHitWallForP2: false,
        },
      });

      renderer.render(
        state,
        {
          localPlayerId: 1,
          mode: 'online',
          partnerVisibility: 'echo',
          lightingEnabled: false,
        },
        16.67
      );

      const allText = ctx.fillTextCalls.map((c) => c.text).join(' | ');
      expect(allText).toContain('PARTNER REQUESTS SHIFT');
      expect(allText).toContain('DANGER: WALL COLLISION ON SHIFT');
    });

    it('renders Partner Waiting at Door indicator and Partner Quick Ping ripple', () => {
      const { canvas, ctx } = createMockCanvasAndCtx();
      const offscreenFactory = () => createMockCanvasAndCtx().canvas;
      const renderer = new GameRenderer(
        canvas,
        {} as CanvasImageSource,
        offscreenFactory
      );

      const state = createMockGameState({
        players: [
          createPlayer(1),
          createPlayer(2, {
            atDoorId: 'door-1',
            ping: {
              active: true,
              x: 150,
              y: 250,
              kind: 'action',
              remainingMs: 1500,
            },
          }),
        ],
      });

      renderer.render(
        state,
        {
          localPlayerId: 1,
          mode: 'online',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        16.67
      );

      const allText = ctx.fillTextCalls.map((c) => c.text).join(' | ');
      expect(allText).toContain('ACTION');
      expect(allText).toContain('DOOR');
    });

    it('renders synthesized ghost wall shimmer and wallOverlayGid tiles', () => {
      const { canvas, ctx } = createMockCanvasAndCtx();
      const offscreenFactory = () => createMockCanvasAndCtx().canvas;
      const renderer = new GameRenderer(
        canvas,
        {} as CanvasImageSource,
        offscreenFactory
      );

      const state = createMockGameState();
      state.room.worlds.neutral.cells[3][3].synthesizedGhostWall = true;
      state.room.worlds.dangerous.cells[3][3].wallGid = 12;
      state.room.worlds.neutral.cells[4][4].wallOverlayGid = 25;

      renderer.render(
        state,
        {
          localPlayerId: 1,
          mode: 'online',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        16.67
      );

      expect(ctx.strokeRect).toHaveBeenCalledWith(
        3 * 25 + 0.5,
        3 * 25 + 0.5,
        24,
        24
      );
    });

    it('renders Partner Echo ripple in online mode when partnerVisibility === echo', () => {
      const { canvas, ctx } = createMockCanvasAndCtx();
      const offscreenFactory = () => createMockCanvasAndCtx().canvas;
      const renderer = new GameRenderer(
        canvas,
        {} as CanvasImageSource,
        offscreenFactory
      );

      const state = createMockGameState({
        convergenceDistance: 10,
        players: [
          createPlayer(1, { x: 50, y: 50 }),
          createPlayer(2, { x: 325, y: 400 }),
        ],
      });

      renderer.render(
        state,
        {
          localPlayerId: 1,
          mode: 'online',
          partnerVisibility: 'echo',
          lightingEnabled: false,
        },
        16.67
      );

      // Partner echo draws a translucent arc centered at partner's (325 + 12.5, 400 + 12.5)
      expect(ctx.arc).toHaveBeenCalledWith(
        337.5,
        412.5,
        expect.any(Number),
        0,
        Math.PI * 2
      );
    });

    it('renders S_ItemGlow [10, 51] on interacted floor item, floating inventory icon, flashScreen events, and fixed I_theEnd victory banner', () => {
      const { canvas, ctx } = createMockCanvasAndCtx();
      const offscreenFactory = () => createMockCanvasAndCtx().canvas;
      const spritesheet = {} as CanvasImageSource;
      const renderer = new GameRenderer(canvas, spritesheet, offscreenFactory);

      const state = createMockGameState({
        players: [
          createPlayer(1, {
            x: 100,
            y: 10, // < 25 -> floating inventory icon should render at y + 25 = 35
            interactingObjectId: 'item-floor-1',
            inventory: [{ id: 'inv-1', type: 'Broom', popUpText: 'A sturdy broom' }],
            currentItemIndex: 0,
            inventoryDisplayTimerMs: 900,
          }),
          createPlayer(2),
        ],
        events: [
          {
            eventId: 1,
            type: 'flashScreen',
            color: '#ff0000',
            durationMs: 300,
            maxOpacity: 0.5,
          },
        ],
      });
      state.room.worlds.neutral.items.push({
        id: 'item-floor-1',
        world: 'neutral',
        x: 100,
        y: 10,
        gid: 1,
        item: { id: 'item-floor-1', type: 'Key', popUpText: 'A key' },
      });

      renderer.render(
        state,
        {
          localPlayerId: 1,
          mode: 'online',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        16.67
      );

      // Verify S_ItemGlow (250, 1275) was drawn at (100, 10)
      expect(
        ctx.drawImageCalls.some(
          (args) => args[1] === 250 && args[2] === 1275 && args[5] === 100 && args[6] === 10
        )
      ).toBe(true);

      // Verify floating inventory icon (Broom [4, 47] -> 100, 1175) was drawn at y + 25 = 35
      expect(
        ctx.drawImageCalls.some(
          (args) => args[1] === 100 && args[2] === 1175 && args[5] === 100 && args[6] === 35
        )
      ).toBe(true);

      // Verify victory phase draws fixed I_theEnd banner at source (350, 650, 1000, 650)
      ctx.drawImageCalls.length = 0;
      renderer.render(
        { ...state, phase: 'victory' },
        {
          localPlayerId: 1,
          mode: 'local',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        16.67
      );
      expect(ctx.drawImageCalls[0]).toEqual([
        spritesheet,
        350,
        650,
        1000,
        650,
        0,
        0,
        1000,
        650,
      ]);
    });
  });
});
