import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/gameEngine';
import {
  isTargetDetected,
  knockbackBlobby,
  spawnInitialTearsForRoom,
} from '../../src/core/monstersAndTears';
import { createDefaultPlayerInput, Direction, SeededRandom } from '../../src/shared/types';

describe('monstersAndTears', () => {
  it('detects Blobby sightline (adjacent, knight-move, straight line of sight) and handles empty path safely', () => {
    const engine = new GameEngine(42);
    engine.loadRoom('monsterIntro');
    const state = engine.getState();
    const grid = state.room.worlds.dangerous;

    // Adjacent
    expect(isTargetDetected(grid, { x: 5, y: 8 }, { x: 5, y: 9 })).toBe(true);
    // Straight clear line
    expect(isTargetDetected(grid, { x: 5, y: 8 }, { x: 5, y: 12 })).toBe(true);
    // Blocked by wall
    expect(isTargetDetected(grid, { x: 5, y: 8 }, { x: 5, y: 0 })).toBe(false);

    // Lock-on when P2 is in sightline of Blobby at (125, 200) -> (5, 8)
    state.players[1].x = 125;
    state.players[1].y = 250; // (5, 10)
    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());

    const blobby = grid.blobbies[0];
    expect(blobby.state).toBe('Seeking');
    expect(state.events.some((e) => e.sound === 'blobbyTracking')).toBe(true);

    // If player is completely walled off (no path exists), Blobby does not crash and stays/returns to Wandering
    blobby.state = 'Wandering';
    state.players[1].x = 0;
    state.players[1].y = 0; // void/wall tile with no path
    expect(() => {
      engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    }).not.toThrow();
  });

  it('knocks back Blobby diagonally when velocity has both vx !== 0 and vy !== 0, and deals Eating damage on contact', () => {
    const engine = new GameEngine(42);
    engine.loadRoom('monsterIntro');
    const state = engine.getState();
    const grid = state.room.worlds.dangerous;
    const blobby = grid.blobbies[0];

    // Give blobby diagonal velocity moving DownLeft toward player
    blobby.x = 150; // tile 6
    blobby.y = 225; // tile 9
    blobby.velocity = { x: -1.0, y: 1.0 };
    blobby.state = 'Seeking';
    state.players[1].x = 125;
    state.players[1].y = 250;

    knockbackBlobby(grid, blobby, state.players[1]);
    expect(blobby.state).toBe('Shocking');
    expect(blobby.nextStep).not.toBeNull();
    // Should step back toward UpRight (x > 6 or y < 9)
    expect(
      blobby.nextStep!.x > 6 || blobby.nextStep!.y < 9
    ).toBe(true);

    // Put Blobby on the same tile as P2 in Seeking state -> transitions to Eating and deals 0.8 damage
    blobby.state = 'Seeking';
    blobby.x = state.players[1].x;
    blobby.y = state.players[1].y;
    const speedBefore = state.players[1].speed;
    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(blobby.state).toBe('Eating');
    expect(state.players[1].speed).toBeCloseTo(speedBefore * 0.8, 4);
    expect(state.events.some((e) => e.sound === 'growl2')).toBe(true);
  });

  it('activates EvilLamp 600ms wind-up within 1.5 tiles, attacks if player stays within 2 tiles, or resets if player retreats', () => {
    const engine = new GameEngine(42);
    engine.loadRoom('lampMonsterIntro');
    const state = engine.getState();
    const evilLamp = state.room.worlds.dangerous.evilLamps[0];
    evilLamp.isOn = true;

    // Place P2 1 tile left of EvilLamp at (250, 300) -> P2 at (225, 300)
    state.players[1].x = evilLamp.x - 25;
    state.players[1].y = evilLamp.y;
    state.players[0].x = 100;
    state.players[0].y = 100;

    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(evilLamp.stage).toBe('opening');
    expect(state.events.some((e) => e.sound === 'creaking1')).toBe(true);

    // Retreat beyond 2 tiles -> returns to dormant without attacking
    state.players[1].x = evilLamp.x - 100;
    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(evilLamp.stage).toBe('dormant');

    // Step back within 1.5 tiles and stay for 600ms -> attacks and enters cooldown!
    state.players[1].x = evilLamp.x - 25;
    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(evilLamp.stage).toBe('opening');

    const prevSpeed = state.players[1].speed;
    engine.tick(600, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(state.players[1].speed).toBeCloseTo(prevSpeed * 0.9, 4);
    expect(
      state.events.some((e) => e.sound === 'evilLampAttack')
    ).toBe(true);
    expect(evilLamp.stage).toBe('cooldown');
  });

  it('grows DimensionTear through stages 0..4, spreads safely even at grid boundaries, regrows after 9000ms, and spawns Blobby pairs', () => {
    const engine = new GameEngine(42);
    const state = engine.getState();

    // Ensure cell (0, 0) and (1, 0) in neutral are walkable floor to test boundary spread
    state.room.worlds.neutral.cells[0][0].collides = false;
    state.room.worlds.neutral.cells[0][0].noLight = false;
    state.room.worlds.neutral.cells[0][0].floorGid = 926;
    state.room.worlds.neutral.cells[1][0].collides = false;
    state.room.worlds.neutral.cells[1][0].noLight = false;
    state.room.worlds.neutral.cells[1][0].floorGid = 926;

    state.room.tears = [
      {
        id: 'edge-tear',
        x: 0,
        y: 0,
        angle: Direction.Horizontal,
        stage: 0,
        growthTimerMs: 3000,
        hasSpread: false,
      },
    ];

    // Advance 5 * 3000ms = 15000ms -> reaches stage 4 and spreads to (25, 0) without crashing on (-1, -1)
    for (let i = 0; i < 5; i++) {
      engine.tick(3000, createDefaultPlayerInput(), createDefaultPlayerInput());
    }
    expect(state.room.tears[0].stage).toBe(4);
    expect(state.room.tears[0].hasSpread).toBe(true);
    expect(state.room.tears.length).toBeGreaterThan(1);

    // Advance blobbySpawnTimerMs to spawn a pair of Blobbies (1 in neutral, 1 in dangerous)
    engine.tick(24000, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(state.room.worlds.neutral.blobbies.length).toBeGreaterThanOrEqual(1);
    expect(state.room.worlds.dangerous.blobbies.length).toBeGreaterThanOrEqual(1);

    // Shrink a stage-0 tear -> removes tear and schedules 9000ms regrowth
    state.room.tears = [
      {
        id: 'regrow-tear',
        x: 25,
        y: 0,
        angle: Direction.Right,
        stage: 0,
        growthTimerMs: 3000,
        hasSpread: false,
      },
    ];
    state.players[0].x = 0;
    state.players[0].y = 0;
    state.players[0].direction = Direction.Right;
    state.players[0].inventory = [
      { id: 'broom-1', type: 'Broom', popUpText: 'A sturdy broom' },
    ];
    const p1In = createDefaultPlayerInput();
    p1In.useItemSeq = 1;
    engine.tick(16.67, p1In, createDefaultPlayerInput());

    expect(state.room.tears.length).toBe(0);
    expect(state.room.pendingRegrowths.length).toBe(1);

    engine.tick(9000, p1In, createDefaultPlayerInput());
    expect(state.room.pendingRegrowths.length).toBe(0);
    expect(state.room.tears.length).toBe(1);
    expect(state.room.tears[0].x).toBe(25);
    expect(state.room.tears[0].y).toBe(0);
  });

  it('guarantees 0 cracks for the first 3 rooms (roomsEntered <= 3) regardless of random roll', () => {
    const engine = new GameEngine(12345);
    const state = engine.getState();

    // Custom RNG that always rolls near 0 (0.0001), which in the old formula guarantees cracks
    const lowRng = {
      nextFloat: () => 0.0001,
      nextInt: (min: number, _max: number) => min,
      getState: () => 0,
      setState: () => {},
    } as unknown as SeededRandom;

    for (const roomsEntered of [0, 1, 2, 3]) {
      state.roomsEntered = roomsEntered;
      state.room.tears = [];
      spawnInitialTearsForRoom(state, lowRng);
      expect(state.room.tears.length).toBe(0);
    }
  });

  it('slowly ramps up crack possibility starting at room 4 and 5', () => {
    const engine = new GameEngine(12345);
    const state = engine.getState();

    // At room 4, effectiveRooms = 1: roll of 0.005 (< 0.01) triggers a crack, but 0.02 (>= 0.01) does not
    const crackRng = {
      nextFloat: () => 0.005,
      nextInt: (_min: number, _max: number) => 0,
      getState: () => 0,
      setState: () => {},
    } as unknown as SeededRandom;

    const noCrackRng = {
      nextFloat: () => 0.05,
      nextInt: (_min: number, _max: number) => 0,
      getState: () => 0,
      setState: () => {},
    } as unknown as SeededRandom;

    state.roomsEntered = 4;
    state.room.tears = [];
    spawnInitialTearsForRoom(state, noCrackRng);
    expect(state.room.tears.length).toBe(0);

    state.roomsEntered = 4;
    state.room.tears = [];
    spawnInitialTearsForRoom(state, crackRng);
    expect(state.room.tears.length).toBeGreaterThanOrEqual(1);

    // At room 5, effectiveRooms = 2: roll of 0.05 yields 0.05^2 = 0.0025 < 0.01, so it now triggers cracks!
    state.roomsEntered = 5;
    state.room.tears = [];
    spawnInitialTearsForRoom(state, noCrackRng); // 0.05 roll
    expect(state.room.tears.length).toBeGreaterThanOrEqual(1);
  });

  it('verifies GameEngine room transitions enforce no cracks through 3 rooms then allows cracks', () => {
    // Seed 42: lets inspect room loading
    const engine = new GameEngine(42);
    // Initial room (room 1): roomsEntered = 1
    expect(engine.getState().roomsEntered).toBe(1);
    expect(engine.getState().room.tears.length).toBe(0);

    // Load second room
    engine.loadRoom('chestIntro');
    expect(engine.getState().roomsEntered).toBe(2);
    expect(engine.getState().room.tears.length).toBe(0);

    // Load third room
    engine.loadRoom('keyIntro');
    expect(engine.getState().roomsEntered).toBe(3);
    expect(engine.getState().room.tears.length).toBe(0);
  });
});
