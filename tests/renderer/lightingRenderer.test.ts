import { describe, it, expect, vi } from 'vitest';
import {
  DIM_WIDTH_TILES,
  DIM_HEIGHT_TILES,
  Direction,
  GridCell,
  WorldGridState,
  WorldType,
  RoomState,
  PlayerState,
  EvilLampEntity,
  FireEntity,
} from '../../src/shared/types';
import {
  computeShadowPolygonsForLight,
  directionToLightAngleRad,
  getEvilLampLightRadius,
  getFireHaloParams,
  LightingRenderer,
} from '../../src/renderer/lightingRenderer';

function createEmptyGridCell(): GridCell {
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

function createMockWorldGrid(world: WorldType): WorldGridState {
  const cells: GridCell[][] = [];
  for (let x = 0; x < DIM_WIDTH_TILES; x++) {
    cells[x] = [];
    for (let y = 0; y < DIM_HEIGHT_TILES; y++) {
      cells[x][y] = createEmptyGridCell();
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

function createMockPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 1,
    side: 'left',
    x: 200,
    y: 200,
    velocity: { x: 0, y: 0 },
    direction: Direction.Right,
    flashLightDir: Direction.Right,
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

function createMockContext() {
  const radialGradientCalls: Array<{
    x0: number;
    y0: number;
    r0: number;
    x1: number;
    y1: number;
    r1: number;
    stops: Array<[number, string]>;
  }> = [];

  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000000' as string | CanvasGradient,
    strokeStyle: '#000000',
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    createRadialGradient: vi.fn(
      (x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => {
        const stops: Array<[number, string]> = [];
        radialGradientCalls.push({ x0, y0, r0, x1, y1, r1, stops });
        return {
          addColorStop: vi.fn((offset: number, color: string) => {
            stops.push([offset, color]);
          }),
        } as unknown as CanvasGradient;
      }
    ),
    radialGradientCalls,
  };
  return ctx;
}

describe('lightingRenderer', () => {
  it('computes 2D shadow occlusion polygons from cell.noLight tiles around a light source', () => {
    const grid = createMockWorldGrid('neutral');
    // Place a noLight wall at tile (5, 5) -> pixel (125..150, 125..150)
    grid.cells[5][5].noLight = true;

    // Light at tile (4, 5) center -> (112.5, 137.5), radius 100
    const quads = computeShadowPolygonsForLight(grid, 112.5, 137.5, 100);
    expect(quads.length).toBeGreaterThan(0);
    for (const quad of quads) {
      expect(quad).toHaveLength(4);
      // Projected vertices (indices 1 and 2) should extend further from light than base vertices (0 and 3)
      const d0 = Math.hypot(quad[0].x - 112.5, quad[0].y - 137.5);
      const d1 = Math.hypot(quad[1].x - 112.5, quad[1].y - 137.5);
      expect(d1).toBeGreaterThan(d0);
    }
  });

  it('selects correct worldGrid via getWorldForSide(side, evilOnLeft) so lamps/shadows never desync', () => {
    const neutral = createMockWorldGrid('neutral');
    const dangerous = createMockWorldGrid('dangerous');

    // Neutral has a lamp at (100, 100); Dangerous has a lamp at (300, 300)
    neutral.lamps.push({
      id: 'n-lamp',
      world: 'neutral',
      x: 100,
      y: 100,
      gid: 1,
      isOn: true,
      isBroken: false,
      linkedLampId: null,
      popUpText: '',
    });
    dangerous.lamps.push({
      id: 'd-lamp',
      world: 'dangerous',
      x: 300,
      y: 300,
      gid: 1,
      isOn: true,
      isBroken: false,
      linkedLampId: null,
      popUpText: '',
    });

    const room: RoomState = {
      roomName: 'spawnRoom',
      worlds: { neutral, dangerous },
      tears: [],
      pendingRegrowths: [],
      blobbySpawnTimerMs: 0,
      chestPressurePlatesToPress: 0,
      chestPressurePlatesPressed: 0,
      swooshTriggered: false,
    };

    const offscreenCtx = createMockContext();
    const targetCtx = createMockContext();
    const renderer = new LightingRenderer(() => ({
      width: 500,
      height: 650,
      getContext: () => offscreenCtx,
    } as unknown as HTMLCanvasElement));

    // When evilOnLeft === true, 'left' side must render 'dangerous' world (lamp at 300+12.5=312.5)
    const selectedLeftWorld = renderer.renderDimensionLighting(
      targetCtx as unknown as CanvasRenderingContext2D,
      {
        side: 'left',
        evilOnLeft: true,
        room,
        player: createMockPlayer({ side: 'left', x: 50, y: 50 }),
        timeMs: 0,
      },
      0
    );
    expect(selectedLeftWorld).toBe('dangerous');
    expect(
      offscreenCtx.radialGradientCalls.some(
        (c) => c.x0 === 312.5 && c.y0 === 312.5 && c.r1 === 100
      )
    ).toBe(true);

    // And 'right' side when evilOnLeft === true must render 'neutral' world (lamp at 100+12.5=112.5)
    offscreenCtx.radialGradientCalls.length = 0;
    const selectedRightWorld = renderer.renderDimensionLighting(
      targetCtx as unknown as CanvasRenderingContext2D,
      {
        side: 'right',
        evilOnLeft: true,
        room,
        player: createMockPlayer({ id: 2, side: 'right', x: 50, y: 50 }),
        timeMs: 0,
      },
      500
    );
    expect(selectedRightWorld).toBe('neutral');
    expect(
      offscreenCtx.radialGradientCalls.some(
        (c) => c.x0 === 112.5 && c.y0 === 112.5 && c.r1 === 100
      )
    ).toBe(true);
    expect(targetCtx.drawImage).toHaveBeenCalledWith(expect.anything(), 500, 0);
  });

  it('computes EvilLamp sinusoidal flicker around 100px when isOn', () => {
    const evilLamp: EvilLampEntity = {
      id: 'el-1',
      world: 'dangerous',
      x: 200,
      y: 200,
      gid: 3402,
      isOn: true,
      linkedLampId: null,
      stage: 'dormant',
      timerMs: 0,
      popUpText: '',
    };
    const r0 = getEvilLampLightRadius(evilLamp, 0);
    const r1 = getEvilLampLightRadius(evilLamp, 120);
    expect(r0).toBeGreaterThanOrEqual(90);
    expect(r0).toBeLessThanOrEqual(110);
    expect(r1).not.toBe(r0);
    expect(getEvilLampLightRadius({ ...evilLamp, isOn: false }, 100)).toBe(0);
  });

  it('computes FireEntity pulsing orange halo (72..80px) when isOn and faint 22px blue ember when !isOn', () => {
    const fireOn: FireEntity = {
      id: 'f-1',
      world: 'neutral',
      x: 100,
      y: 100,
      gid: 1,
      variant: 1,
      isOn: true,
      damageTimerMs: 0,
    };
    const onParams = getFireHaloParams(fireOn, 250);
    expect(onParams.radius).toBeGreaterThanOrEqual(72);
    expect(onParams.radius).toBeLessThanOrEqual(80);
    expect(onParams.punchLightCircle).toBe(true);
    expect(onParams.tintColor).toContain('orange');

    const fireOff: FireEntity = { ...fireOn, isOn: false };
    const offParams = getFireHaloParams(fireOff, 250);
    expect(offParams.radius).toBe(22);
    expect(offParams.punchLightCircle).toBe(false);
  });

  it('punches base 50px LightHalo plus flashlight1 (150px cone), flashlight2 (350px cone), and lantern (175px circle)', () => {
    const neutral = createMockWorldGrid('neutral');
    const room: RoomState = {
      roomName: 'spawnRoom',
      worlds: { neutral, dangerous: createMockWorldGrid('dangerous') },
      tears: [],
      pendingRegrowths: [],
      blobbySpawnTimerMs: 0,
      chestPressurePlatesToPress: 0,
      chestPressurePlatesPressed: 0,
      swooshTriggered: false,
    };

    const offscreenCtx = createMockContext();
    const targetCtx = createMockContext();
    const renderer = new LightingRenderer(() => ({
      width: 500,
      height: 650,
      getContext: () => offscreenCtx,
    } as unknown as HTMLCanvasElement));

    // 1. Base halo + lantern (175px radial circle)
    renderer.renderDimensionLighting(targetCtx as unknown as CanvasRenderingContext2D, {
      side: 'left',
      evilOnLeft: false,
      room,
      player: createMockPlayer({ x: 200, y: 200, flashlightMode: 'lantern' }),
      timeMs: 0,
    });
    expect(offscreenCtx.radialGradientCalls.some((c) => c.r1 === 50)).toBe(true);
    expect(offscreenCtx.radialGradientCalls.some((c) => c.r1 === 175)).toBe(true);

    // 2. flashlight1 (150px cone) and flashlight2 (350px cone)
    offscreenCtx.radialGradientCalls.length = 0;
    renderer.renderDimensionLighting(targetCtx as unknown as CanvasRenderingContext2D, {
      side: 'left',
      evilOnLeft: false,
      room,
      player: createMockPlayer({
        x: 200,
        y: 200,
        flashLightDir: Direction.Up,
        flashlightMode: 'flashlight1',
      }),
      timeMs: 0,
    });
    expect(offscreenCtx.radialGradientCalls.some((c) => c.r1 === 150)).toBe(true);

    offscreenCtx.radialGradientCalls.length = 0;
    renderer.renderDimensionLighting(targetCtx as unknown as CanvasRenderingContext2D, {
      side: 'left',
      evilOnLeft: false,
      room,
      player: createMockPlayer({
        x: 200,
        y: 200,
        flashLightDir: Direction.DownRight,
        flashlightMode: 'flashlight2',
      }),
      timeMs: 0,
    });
    expect(offscreenCtx.radialGradientCalls.some((c) => c.r1 === 350)).toBe(true);

    expect(directionToLightAngleRad(Direction.Right)).toBeCloseTo(0);
    expect(directionToLightAngleRad(Direction.Left)).toBeCloseTo(Math.PI);
    expect(directionToLightAngleRad(Direction.Up)).toBeCloseTo(-Math.PI / 2);
    expect(directionToLightAngleRad(Direction.Down)).toBeCloseTo(Math.PI / 2);
  });
});
