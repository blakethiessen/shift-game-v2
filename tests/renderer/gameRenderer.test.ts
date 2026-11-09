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
  computeTypewriterPopupLines,
  POPUP_MAX_CHARS_PER_LINE,
  POPUP_MAX_VISIBLE_LINES,
  POPUP_TYPEWRITER_MS_PER_CHAR,
  computeFloatingInventoryPosition,
  computeFinalRoomConvergenceAlpha,
  computeCameraViewport,
  computeDimensionVisibleRect,
  computeWindowStageLayout,
  DEFAULT_WINDOW_SCALE_MODE,
  WINDOW_SCALE_MODES,
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

    it('types popup text character-by-character and scrolls a 4-line window like the original Crafty.js TextPrinter without a bounding box', () => {
      expect(POPUP_MAX_CHARS_PER_LINE).toBe(14);
      expect(POPUP_MAX_VISIBLE_LINES).toBe(4);
      expect(POPUP_TYPEWRITER_MS_PER_CHAR).toBeGreaterThan(0);

      const bookText =
        'This chest is locked! To open it, activate all of the pressure plates and levers in the room.';

      // At elapsedMs = 0, starts typing the very first character on line 1
      const atStart = computeTypewriterPopupLines(bookText, 0);
      expect(atStart).toEqual(['T']);

      // After 5 character intervals, shows first 6 characters of line 1 ("This c")
      const at5Chars = computeTypewriterPopupLines(
        bookText,
        5 * POPUP_TYPEWRITER_MS_PER_CHAR
      );
      expect(at5Chars).toEqual(['This c']);

      // Partway through line 3 -> shows lines 1, 2, and partial line 3 (<= 4 lines)
      const midTyping = computeTypewriterPopupLines(
        bookText,
        28 * POPUP_TYPEWRITER_MS_PER_CHAR
      );
      expect(midTyping.length).toBe(3);
      expect(midTyping[0]).toBe('This chest is');
      expect(midTyping[1]).toBe('locked! To');

      // Once typing progresses past line 4 into line 5+, window scrolls so at most 4 lines are shown
      // and line 1 ('This chest is') has scrolled off the top
      const atEnd = computeTypewriterPopupLines(
        bookText,
        500 * POPUP_TYPEWRITER_MS_PER_CHAR
      );
      expect(atEnd.length).toBe(4);
      expect(atEnd).not.toContain('This chest is');
      expect(atEnd[atEnd.length - 2]).toBe('levers in the');
      expect(atEnd[atEnd.length - 1]).toBe('room.');

      // Verify GameRenderer renders typewriter popup text with NO bounding box (no fillRect / strokeRect)
      // and advances/resets typewriter state across frames
      const { canvas, ctx } = createMockCanvasAndCtx();
      const offscreenFactory = () => createMockCanvasAndCtx().canvas;
      const renderer = new GameRenderer(
        canvas,
        {} as CanvasImageSource,
        offscreenFactory
      );

      const stateWithPopup = createMockGameState({
        players: [
          createPlayer(1, {
            x: 225,
            y: 300,
            interactingObjectId: 'book-1',
            activePopupText: bookText,
            popupFaceDirection: Direction.Up,
          }),
          createPlayer(2),
        ],
      });

      ctx.fillRect.mockClear();
      ctx.strokeRect.mockClear();
      ctx.fillTextCalls.length = 0;

      // Frame 1 (dtMs = 0): starts typing first char, zero fillRect/strokeRect calls (no bounding box)
      renderer.render(
        stateWithPopup,
        {
          localPlayerId: 1,
          mode: 'online',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        0
      );
      expect(ctx.fillRect).not.toHaveBeenCalled();
      expect(ctx.strokeRect).not.toHaveBeenCalled();
      expect(ctx.fillTextCalls.map((c) => c.text)).toEqual(['T']);

      // Advance by 10 chars worth of time -> reveals more text on line 1
      ctx.fillTextCalls.length = 0;
      renderer.render(
        stateWithPopup,
        {
          localPlayerId: 1,
          mode: 'online',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        10 * POPUP_TYPEWRITER_MS_PER_CHAR
      );
      expect(ctx.fillRect).not.toHaveBeenCalled();
      expect(ctx.strokeRect).not.toHaveBeenCalled();
      expect(ctx.fillTextCalls[0].text).toBe('This chest ');

      // Advance past the end of the text -> scrolls to final 4 lines
      ctx.fillTextCalls.length = 0;
      renderer.render(
        stateWithPopup,
        {
          localPlayerId: 1,
          mode: 'online',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        500 * POPUP_TYPEWRITER_MS_PER_CHAR
      );
      expect(ctx.fillTextCalls.length).toBe(4);
      expect(ctx.fillTextCalls[2].text).toBe('levers in the');
      expect(ctx.fillTextCalls[3].text).toBe('room.');

      // Moving away (activePopupText: null) and re-approaching resets the typewriter back to the start
      const stateNoPopup = createMockGameState({
        players: [
          createPlayer(1, {
            x: 225,
            y: 350,
            interactingObjectId: null,
            activePopupText: null,
          }),
          createPlayer(2),
        ],
      });
      renderer.render(
        stateNoPopup,
        {
          localPlayerId: 1,
          mode: 'online',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        16.67
      );

      ctx.fillTextCalls.length = 0;
      renderer.render(
        stateWithPopup,
        {
          localPlayerId: 1,
          mode: 'online',
          partnerVisibility: 'strict',
          lightingEnabled: false,
        },
        0
      );
      expect(ctx.fillTextCalls.map((c) => c.text)).toEqual(['T']);
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

    it('renders 5-tile FryingPan attack animation across the full 500ms swing duration using spritesheet cols 54..77, skips empty action tiles, disables smoothing, and snaps sub-pixel player coordinates', () => {
      const { canvas, ctx } = createMockCanvasAndCtx();
      (ctx as Record<string, unknown>).imageSmoothingEnabled = true;
      const offscreenFactory = () => createMockCanvasAndCtx().canvas;
      const spritesheet = {} as CanvasImageSource;
      const renderer = new GameRenderer(canvas, spritesheet, offscreenFactory);

      // Mid-swing (timerMs = 300 out of 500 -> progress = 0.4 -> frameIdx = 1 of 4 for Left)
      // Use sub-pixel coordinates (e.g. after diagonal movement) to verify integer pixel snapping
      const state = createMockGameState({
        players: [
          createPlayer(1, {
            x: 200.42857,
            y: 300.14285,
            direction: Direction.Left,
            attackState: {
              active: true,
              weapon: 'FryingPan',
              timerMs: 300,
              direction: Direction.Left,
              hasDealtKnockback: false,
            },
          }),
          createPlayer(2),
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

      // Should disable imageSmoothingEnabled even at 1x camera zoom to prevent atlas border bleeding
      expect((ctx as Record<string, unknown>).imageSmoothingEnabled).toBe(false);

      // Frame 1 of P1 FryingPan Left:
      // playerTile[1] = [56, 15] -> (1400, 375) drawn at integer-snapped (200, 300)
      // leftTile[1] = [55, 15] -> (1375, 375) drawn at integer-snapped (175, 300)
      // Empty action tiles (ACTION_EMPTY [5, 1] -> 125, 25) must NOT be drawn via drawImage
      expect(
        ctx.drawImageCalls.some(
          (args) =>
            args[1] === 56 * 25 &&
            args[2] === 15 * 25 &&
            args[5] === 200 &&
            args[6] === 300
        )
      ).toBe(true);
      expect(
        ctx.drawImageCalls.some(
          (args) =>
            args[1] === 55 * 25 &&
            args[2] === 15 * 25 &&
            args[5] === 175 &&
            args[6] === 300
        )
      ).toBe(true);
      expect(
        ctx.drawImageCalls.some(
          (args) => args[1] === 5 * 25 && args[2] === 1 * 25
        )
      ).toBe(false);
    });
  });

  describe('computeWindowStageLayout (Browser Window Game Scaling)', () => {
    it('defaults to proportional fit with integer-snapped tile dimensions ("fit") across 1080p, 1440p, 4K, and smaller viewports', () => {
      expect(DEFAULT_WINDOW_SCALE_MODE).toBe('fit');
      expect(WINDOW_SCALE_MODES).toEqual([
        'fit',
        'integer',
        'stretch',
        'native',
      ]);

      // 1080p browser tab (1920x960) in Local/Menu mode (1000x650 = 40x26 tiles of 25px)
      // tilePx = floor(min(1920 / 40, 960 / 26)) = floor(min(48, 36.923)) = 36
      const fit1080Local = computeWindowStageLayout(1920, 960, 1000, 650, 'fit');
      expect(fit1080Local).toEqual({
        mode: 'fit',
        baseWidth: 1000,
        baseHeight: 650,
        width: 1440,
        height: 936,
        scaleX: 1.44,
        scaleY: 1.44,
        tilePx: 36,
      });

      // 1080p browser tab (1920x960) in Online mode (500x650 = 20x26 tiles of 25px)
      // tilePx = floor(min(1920 / 20, 960 / 26)) = 36 -> 720x936
      const fit1080Online = computeWindowStageLayout(1920, 960, 500, 650, 'fit');
      expect(fit1080Online).toEqual({
        mode: 'fit',
        baseWidth: 500,
        baseHeight: 650,
        width: 720,
        height: 936,
        scaleX: 1.44,
        scaleY: 1.44,
        tilePx: 36,
      });

      // Exact 2x viewport (2000x1300) -> tilePx = 50, scale = 2.0
      const fit2x = computeWindowStageLayout(2000, 1300, 1000, 650, 'fit');
      expect(fit2x.width).toBe(2000);
      expect(fit2x.height).toBe(1300);
      expect(fit2x.scaleX).toBe(2);
      expect(fit2x.tilePx).toBe(50);

      // Smaller window (800x520) -> downscales cleanly with tilePx = 20 (0.8x)
      const fitSmall = computeWindowStageLayout(800, 520, 1000, 650, 'fit');
      expect(fitSmall.width).toBe(800);
      expect(fitSmall.height).toBe(520);
      expect(fitSmall.scaleX).toBe(0.8);
      expect(fitSmall.tilePx).toBe(20);
    });

    it('computes strict whole-canvas multiples (1x, 2x, 3x) in "integer" mode and downscales cleanly when viewport < 1x', () => {
      // 1920x960 -> floor(min(1.92, 1.4769)) = 1x (1000x650)
      const int1080 = computeWindowStageLayout(1920, 960, 1000, 650, 'integer');
      expect(int1080).toEqual({
        mode: 'integer',
        baseWidth: 1000,
        baseHeight: 650,
        width: 1000,
        height: 650,
        scaleX: 1,
        scaleY: 1,
        tilePx: 25,
      });

      // 2560x1440 -> floor(min(2.56, 2.215)) = 2x (2000x1300)
      const int1440 = computeWindowStageLayout(2560, 1440, 1000, 650, 'integer');
      expect(int1440).toEqual({
        mode: 'integer',
        baseWidth: 1000,
        baseHeight: 650,
        width: 2000,
        height: 1300,
        scaleX: 2,
        scaleY: 2,
        tilePx: 50,
      });

      // 3840x2160 -> floor(min(3.84, 3.32)) = 3x (3000x1950)
      const int4k = computeWindowStageLayout(3840, 2160, 1000, 650, 'integer');
      expect(int4k.width).toBe(3000);
      expect(int4k.height).toBe(1950);
      expect(int4k.scaleX).toBe(3);
      expect(int4k.tilePx).toBe(75);

      // Sub-1x window (800x520) -> downscales to integer tile size (20px) so it never clips
      const intSub1x = computeWindowStageLayout(800, 520, 1000, 650, 'integer');
      expect(intSub1x.width).toBe(800);
      expect(intSub1x.height).toBe(520);
      expect(intSub1x.scaleX).toBe(0.8);
      expect(intSub1x.tilePx).toBe(20);
    });

    it('zooms uniformly to fill the window in "stretch" (Full) mode (never stretching or compressing aspect ratio) and uses fixed 1x dimensions in "native" mode', () => {
      // Every WindowScaleMode must preserve 1:1 pixel aspect ratio (scaleX === scaleY)
      for (const mode of WINDOW_SCALE_MODES) {
        const localLayout = computeWindowStageLayout(1920, 1080, 1000, 650, mode);
        expect(localLayout.scaleX).toBeCloseTo(localLayout.scaleY, 6);

        const onlineLayout = computeWindowStageLayout(1920, 1080, 500, 650, mode);
        expect(onlineLayout.scaleX).toBeCloseTo(onlineLayout.scaleY, 6);
      }

      // 1920x1080 with 1000x650 base: max(1920/1000, 1080/650) = max(1.92, 1.6615) = 1.92
      const fullWide = computeWindowStageLayout(1920, 1080, 1000, 650, 'stretch');
      expect(fullWide.width).toBe(1920);
      expect(fullWide.height).toBe(1248);
      expect(fullWide.scaleX).toBeCloseTo(1.92, 5);
      expect(fullWide.scaleY).toBeCloseTo(1.92, 5);

      // 1000x1000 with 1000x650 base: max(1000/1000, 1000/650) = 1000/650 = 1.53846
      const fullTall = computeWindowStageLayout(1000, 1000, 1000, 650, 'stretch');
      expect(fullTall.width).toBe(Math.round(1000 * (1000 / 650)));
      expect(fullTall.height).toBe(1000);
      expect(fullTall.scaleX).toBeCloseTo(1000 / 650, 5);
      expect(fullTall.scaleY).toBeCloseTo(1000 / 650, 5);

      const nativeLayout = computeWindowStageLayout(2560, 1440, 500, 650, 'native');
      expect(nativeLayout).toEqual({
        mode: 'native',
        baseWidth: 500,
        baseHeight: 650,
        width: 500,
        height: 650,
        scaleX: 1,
        scaleY: 1,
        tilePx: 25,
      });

      // Edge cases: non-finite / negative / zero inputs and tiny viewports (10x10)
      const fallbackLayout = computeWindowStageLayout(
        Number.NaN,
        -100,
        0,
        Number.POSITIVE_INFINITY,
        'invalid_mode' as any
      );
      expect(fallbackLayout.mode).toBe('fit');
      expect(fallbackLayout.width).toBe(1000);
      expect(fallbackLayout.height).toBe(650);
      expect(fallbackLayout.tilePx).toBe(25);

      const tinyLayout = computeWindowStageLayout(10, 10, 1000, 650, 'fit');
      expect(tinyLayout.tilePx).toBe(1);
      expect(tinyLayout.width).toBe(40);
      expect(tinyLayout.height).toBe(26);
    });

    it('resizes canvas to 1000x650 before drawing full-screen gameOver/victory banners even in online mode', () => {
      const { canvas } = createMockCanvasAndCtx();
      const offscreenFactory = () => createMockCanvasAndCtx().canvas;
      const renderer = new GameRenderer(
        canvas,
        {} as CanvasImageSource,
        offscreenFactory
      );

      const state = createMockGameState({ phase: 'gameOver' });
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
      expect(canvas.width).toBe(1000);
      expect(canvas.height).toBe(650);
    });

    it('disables darkness and renders Blobby and Dimension Tear health bars/HP text when testingMode is enabled', () => {
      const { canvas, ctx } = createMockCanvasAndCtx();
      const offscreenCanvases: ReturnType<typeof createMockCanvasAndCtx>[] = [];
      const offscreenFactory = () => {
        const mock = createMockCanvasAndCtx();
        offscreenCanvases.push(mock);
        return mock.canvas;
      };
      const renderer = new GameRenderer(
        canvas,
        {} as CanvasImageSource,
        offscreenFactory
      );

      const state = createMockGameState();
      state.room.tears.push({
        id: 'tear-test-1',
        x: 150,
        y: 200,
        angle: Direction.Horizontal,
        stage: 2, // 3/5 HP
        growthTimerMs: 3000,
        hasSpread: false,
        lastHitTick: 9,
      });
      state.room.worlds.neutral.blobbies.push({
        id: 'blobby-test-1',
        world: 'neutral',
        x: 250,
        y: 300,
        velocity: { x: 0, y: 0 },
        direction: Direction.Down,
        state: 'Wandering',
        currentSpeed: 0.8,
        wanderTimerTicks: 0,
        wanderIntervalTicks: 40,
        eatingTimerTicks: 0,
        path: [],
        nextStepIdx: 0,
        nextStep: null,
        oldTargetCoord: { x: 0, y: 0 },
        hp: 2,
        maxHp: 3,
        lastHitTick: 10,
      });

      // Render with testingMode: false -> no entity health labels drawn
      renderer.render(
        state,
        {
          localPlayerId: 1,
          mode: 'local',
          partnerVisibility: 'strict',
          lightingEnabled: false,
          testingMode: false,
        },
        16.67
      );
      const textsWithoutTesting = ctx.fillTextCalls.map((c) => c.text).join(' | ');
      expect(textsWithoutTesting).not.toContain('3/5');
      expect(textsWithoutTesting).not.toContain('2/3');

      // Render with testingMode: true (even if lightingEnabled: true is passed)
      ctx.fillTextCalls.length = 0;
      for (const off of offscreenCanvases) {
        off.ctx.fillRect.mockClear();
      }
      renderer.render(
        state,
        {
          localPlayerId: 1,
          mode: 'local',
          partnerVisibility: 'strict',
          lightingEnabled: true,
          testingMode: true,
        },
        16.67
      );

      // Lighting offscreen canvases must NOT be filled when testingMode is true (darkness disabled)
      const offscreenFillCalls = offscreenCanvases.reduce(
        (sum, c) => sum + c.ctx.fillRect.mock.calls.length,
        0
      );
      expect(offscreenFillCalls).toBe(0);

      const textsWithTesting = ctx.fillTextCalls.map((c) => c.text).join(' | ');
      expect(textsWithTesting).toContain('3/5');
      expect(textsWithTesting).toContain('2/3');
    });

    it('computes visible dimension sub-rectangles and keeps characters & overlays centered in the visible window on non-traditional aspect ratios in "stretch" (SCALE: FULL) mode', () => {
      // Uncropped in fit/integer/native modes
      expect(
        computeDimensionVisibleRect('left', 'fit', 900, 1100)
      ).toEqual({
        visX: 0,
        visY: 0,
        visW: 500,
        visH: 650,
      });

      // Tall portrait window (900x1100) in Local Co-op (1000x650) with 'stretch' (SCALE: FULL):
      // scale = 1100 / 650 = 1.692307...
      // visibleBaseW = 900 / scale = 531.818... -> cropX = (1000 - 531.818) / 2 = 234.09...
      const leftTall = computeDimensionVisibleRect('left', 'stretch', 900, 1100);
      const rightTall = computeDimensionVisibleRect('right', 'stretch', 900, 1100);
      expect(leftTall.visX).toBeGreaterThan(230);
      expect(leftTall.visW).toBeCloseTo(500 - leftTall.visX, 5);
      expect(leftTall.visY).toBe(0);
      expect(leftTall.visH).toBe(650);

      expect(rightTall.visX).toBe(0);
      expect(rightTall.visW).toBeCloseTo(leftTall.visW, 5);
      expect(rightTall.visY).toBe(0);
      expect(rightTall.visH).toBe(650);

      // Online single-dimension (500x650) in a tall/narrow window (300x900):
      const singleTall = computeDimensionVisibleRect('single', 'stretch', 300, 900);
      expect(singleTall.visX).toBeGreaterThan(0);
      expect(singleTall.visW).toBeCloseTo(500 - 2 * singleTall.visX, 5);

      // Ultrawide window (2400x800) in Local Co-op (1000x650) with 'stretch':
      // scale = 2.4 -> visibleBaseH = 800 / 2.4 = 333.33 -> cropY = (650 - 333.33) / 2 = 158.33
      const leftWide = computeDimensionVisibleRect('left', 'stretch', 2400, 800);
      expect(leftWide.visX).toBe(0);
      expect(leftWide.visW).toBe(500);
      expect(leftWide.visY).toBeCloseTo(158.333, 2);
      expect(leftWide.visH).toBeCloseTo(333.333, 2);

      // Camera viewport with cropped visibleRect at 2x zoom centers player within visW / zoom
      const cam2xTall = computeCameraViewport(225, 300, 2.0, leftTall);
      expect(cam2xTall.viewWidth).toBeCloseTo(leftTall.visW / 2, 4);
      expect(cam2xTall.viewHeight).toBe(325);
      // Player center is 237.5 -> camX + viewWidth / 2 should be ~237.5
      expect(cam2xTall.camX + cam2xTall.viewWidth / 2).toBeCloseTo(237.5, 0);

      // Even at 1x zoom, when visibleRect is cropped (leftTall.visW < 500), camera tracks player horizontally!
      const cam1xTall = computeCameraViewport(225, 300, 1.0, leftTall);
      expect(cam1xTall.viewWidth).toBeCloseTo(leftTall.visW, 4);
      expect(cam1xTall.camX + cam1xTall.viewWidth / 2).toBeCloseTo(237.5, 0);

      // Verify GameRenderer.render translates each dimension view to (offsetX + visX, visY)
      // and centers popup text within the visible sub-rectangle
      const { canvas, ctx } = createMockCanvasAndCtx();
      const offscreenFactory = () => createMockCanvasAndCtx().canvas;
      const renderer = new GameRenderer(
        canvas,
        {} as CanvasImageSource,
        offscreenFactory
      );

      const state = createMockGameState({
        players: [
          createPlayer(1, {
            side: 'left',
            x: 225,
            y: 300,
            activePopupText: 'A normal-looking lamp.',
            interactingObjectId: 'lamp-1',
            popupFaceDirection: Direction.Down,
          }),
          createPlayer(2, {
            side: 'right',
            x: 225,
            y: 300,
            activePopupText: 'A normal-looking lamp.',
            interactingObjectId: 'lamp-2',
            popupFaceDirection: Direction.Down,
          }),
        ],
      });

      const renderOpts: RenderOptions = {
        localPlayerId: 1,
        mode: 'local',
        partnerVisibility: 'strict',
        lightingEnabled: false,
        cameraZoom: 2.0,
        windowScaleMode: 'stretch',
        viewportWidth: 900,
        viewportHeight: 1100,
      };
      renderer.render(state, renderOpts, 16.67);
      renderer.render(state, renderOpts, 1000);

      // Left dimension camera should translate to (leftTall.visX, 0) instead of (0, 0)
      expect(ctx.translate).toHaveBeenCalledWith(leftTall.visX, 0);
      // Right dimension camera should translate to (500 + rightTall.visX, 0) = (500, 0) and clip to rightTall.visW
      expect(ctx.rect).toHaveBeenCalledWith(
        leftTall.visX,
        0,
        leftTall.visW,
        leftTall.visH
      );
      expect(ctx.rect).toHaveBeenCalledWith(
        500,
        0,
        rightTall.visW,
        rightTall.visH
      );

      // Both players' popup text should be centered near the middle of their visible screen half:
      // Left visible center X = leftTall.visX + leftTall.visW / 2 (~367)
      // Right visible center X = 500 + rightTall.visW / 2 (~633)
      const leftVisibleCenterX = leftTall.visX + leftTall.visW / 2;
      const rightVisibleCenterX = 500 + rightTall.visW / 2;
      const popupFillCalls = ctx.fillTextCalls.filter((c) =>
        c.text.includes('normal-')
      );
      expect(popupFillCalls.length).toBeGreaterThanOrEqual(2);
      expect(popupFillCalls[0].x).toBeCloseTo(leftVisibleCenterX, -1);
      expect(popupFillCalls[1].x).toBeCloseTo(rightVisibleCenterX, -1);
    });
  });
});
