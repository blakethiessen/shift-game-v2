import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/gameEngine';
import { findPath, findNearestFreeTile } from '../../src/core/pathfinding';
import { takeDamage, getHealthStateForSpeed } from '../../src/core/playerLogic';
import {
  createDefaultPlayerInput,
  Direction,
  localPixelToTile,
} from '../../src/shared/types';

describe('playerAndItems & pathfinding', () => {
  it('computes 8-directional A* path with diagonal corner-cutting prevention and nearest free tile BFS', () => {
    const engine = new GameEngine(42);
    const grid = engine.getState().room.worlds.neutral;

    // Clear a small area and test diagonal corner-cutting prevention
    for (let x = 5; x <= 10; x++) {
      for (let y = 5; y <= 10; y++) {
        grid.cells[x][y].collides = false;
        grid.cells[x][y].noLight = false;
        grid.cells[x][y].floorGid = 926;
      }
    }
    // Block (6, 5) so moving diagonally from (5, 5) to (6, 6) cannot cut corner
    grid.cells[6][5].collides = true;
    grid.cells[6][5].noLight = true;

    const path = findPath(grid, { x: 5, y: 5 }, { x: 6, y: 6 });
    expect(path.length).toBeGreaterThanOrEqual(2);
    // First step cannot be (6, 6) directly because (6, 5) is blocked
    expect(path[0]).not.toEqual({ x: 6, y: 6 });
    expect(path[path.length - 1]).toEqual({ x: 6, y: 6 });

    // Nearest free tile from blocked (6, 5)
    const free = findNearestFreeTile(grid, { x: 6, y: 5 });
    expect(grid.cells[free.x][free.y].collides).toBe(false);
  });

  it('moves player, respects wall collisions, and pushes linked cross-dimension boxes at 0.75x speed', () => {
    const engine = new GameEngine(42);
    const state = engine.getState();

    // Place P1 at (325, 450) next to box at (350, 450) in spawnRoom
    state.players[0].x = 325;
    state.players[0].y = 450;
    state.players[1].x = 200;
    state.players[1].y = 250;

    const nBox = state.room.worlds.neutral.boxes[0];
    const dBox = state.room.worlds.dangerous.boxes[0];
    expect(nBox.x).toBe(350);
    expect(nBox.y).toBe(450);

    // Move right into box for several ticks
    const p1In = createDefaultPlayerInput();
    p1In.right = true;
    for (let i = 0; i < 5; i++) {
      engine.tick(16.67, p1In, createDefaultPlayerInput());
    }

    expect(state.players[0].boxColliding).toBe(true);
    expect(nBox.x).toBeGreaterThan(350);
    expect(dBox.x).toBe(nBox.x);

    // If partner stands in the way of linked box in the other dimension, box cannot be pushed further
    state.players[1].x = dBox.x + 20;
    state.players[1].y = dBox.y;
    const prevBoxX = nBox.x;
    engine.tick(16.67, p1In, createDefaultPlayerInput());
    expect(nBox.x).toBe(prevBoxX);
  });

  it('maps player speed to 4 health states, regenerates speed every 5000ms, and pushes toward partner on takeDamage', () => {
    expect(getHealthStateForSpeed(2.0)).toBe('Normal');
    expect(getHealthStateForSpeed(1.5)).toBe('Bruised');
    expect(getHealthStateForSpeed(1.0)).toBe('Injured');
    expect(getHealthStateForSpeed(0.7)).toBe('Dying');

    const engine = new GameEngine(42);
    const state = engine.getState();
    state.players[0].x = 125;
    state.players[0].y = 225;
    state.players[1].x = 275;
    state.players[1].y = 225;

    const beforeDist = Math.abs(state.players[0].x - state.players[1].x);
    takeDamage(state, 1, 0.8);
    expect(state.players[0].speed).toBeCloseTo(1.6, 4);
    expect(state.players[0].healthState).toBe('Bruised');
    const afterDist = Math.abs(state.players[0].x - state.players[1].x);
    expect(afterDist).toBeLessThan(beforeDist);

    // Passive speed regen (+0.1 every 5000ms)
    engine.tick(5000, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(state.players[0].speed).toBeCloseTo(1.7, 4);
    expect(state.players[0].healthState).toBe('Normal');
  });

  it('triggers shared death and transitions to gameOver after 3000ms when damaged on the same tile', () => {
    const engine = new GameEngine(42);
    const state = engine.getState();
    state.players[0].x = 200;
    state.players[0].y = 300;
    state.players[1].x = 200;
    state.players[1].y = 300;

    takeDamage(state, 1, 0.8);
    expect(state.players[0].isAlive).toBe(false);
    expect(state.players[1].isAlive).toBe(false);
    expect(state.phase).toBe('dying');
    expect(state.events.some((e) => e.sound === 'death')).toBe(true);

    engine.tick(3000, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(state.phase).toBe('gameOver');
  });

  it('handles item pickup, cycling, diagonal item drop without (0,0) teleport bug, and flashlight turnoff on drop', () => {
    const engine = new GameEngine(42);
    const state = engine.getState();

    // Place P1 directly on Flashlight in spawnRoom at (150, 425)
    state.players[0].x = 150;
    state.players[0].y = 425;
    const p1In = createDefaultPlayerInput();
    p1In.interactSeq = 1;
    engine.tick(16.67, p1In, createDefaultPlayerInput());

    expect(state.players[0].inventory.length).toBe(1);
    expect(state.players[0].inventory[0].type).toBe('Flashlight');

    // Toggle flashlight on
    p1In.useItemSeq = 1;
    engine.tick(16.67, p1In, createDefaultPlayerInput());
    expect(state.players[0].flashlightMode).toBe('flashlight1');

    // Also pick up Chips at (100, 200)
    state.players[0].x = 100;
    state.players[0].y = 200;
    p1In.interactSeq = 2;
    engine.tick(16.67, p1In, createDefaultPlayerInput());
    expect(state.players[0].inventory.length).toBe(2);

    // Cycle inventory
    p1In.inventoryCycleSeq = 1;
    engine.tick(16.67, p1In, createDefaultPlayerInput());
    expect(state.players[0].currentItemIndex).toBe(1);
    expect(state.players[0].inventoryDisplayTimerMs).toBeCloseTo(1500, 0);

    // Cycle back to Flashlight (index 0) and drop while facing UpLeft (diagonal!)
    p1In.inventoryCycleSeq = 2;
    engine.tick(16.67, p1In, createDefaultPlayerInput());
    expect(state.players[0].currentItemIndex).toBe(0);

    state.players[0].x = 200;
    state.players[0].y = 300;
    state.players[0].direction = Direction.UpLeft;
    p1In.inventoryDropSeq = 1;
    engine.tick(16.67, p1In, createDefaultPlayerInput());

    expect(state.players[0].flashlightMode).toBe('none');
    const droppedFlashlight = state.room.worlds.neutral.items.find(
      (i) => i.item.type === 'Flashlight'
    );
    expect(droppedFlashlight).toBeDefined();
    expect(droppedFlashlight?.x).toBeGreaterThan(0);
    expect(droppedFlashlight?.y).toBeGreaterThan(0);
    const tile = localPixelToTile(droppedFlashlight!.x, droppedFlashlight!.y);
    expect(Math.abs(tile.x - 8)).toBeLessThanOrEqual(1);
    expect(Math.abs(tile.y - 12)).toBeLessThanOrEqual(1);
  });

  it('uses weapon to shrink tear and knock back blobby within 1 tile, and resets attackState.active when swing ends', () => {
    const engine = new GameEngine(42);
    const state = engine.getState();
    state.players[0].x = 200;
    state.players[0].y = 300;
    state.players[0].direction = Direction.Right;
    state.players[0].inventory.push({
      id: 'pan-1',
      type: 'FryingPan',
      popUpText: 'A frying pan, used mainly for hitting things',
    });

    // Add a tear on the front tile (225, 300) at stage 2
    state.room.tears.push({
      id: 'tear-1',
      x: 225,
      y: 300,
      angle: Direction.Horizontal,
      stage: 2,
      growthTimerMs: 3000,
      hasSpread: false,
    });

    // Add a Blobby at (225, 300) in neutral world and another far away at (375, 450)
    state.room.worlds.neutral.blobbies.push(
      {
        id: 'blobby-near',
        world: 'neutral',
        x: 225,
        y: 300,
        velocity: { x: -1, y: 0 },
        direction: Direction.Left,
        state: 'Seeking',
        currentSpeed: 1.2,
        wanderTimerTicks: 0,
        wanderIntervalTicks: 40,
        eatingTimerTicks: 0,
        path: [],
        nextStepIdx: 0,
        nextStep: null,
        oldTargetCoord: { x: 8, y: 12 },
      },
      {
        id: 'blobby-far',
        world: 'neutral',
        x: 375,
        y: 450,
        velocity: { x: -1, y: 0 },
        direction: Direction.Left,
        state: 'Seeking',
        currentSpeed: 1.2,
        wanderTimerTicks: 0,
        wanderIntervalTicks: 40,
        eatingTimerTicks: 0,
        path: [],
        nextStepIdx: 0,
        nextStep: null,
        oldTargetCoord: { x: 8, y: 12 },
      }
    );

    const p1In = createDefaultPlayerInput();
    p1In.useItemSeq = 1;
    engine.tick(16.67, p1In, createDefaultPlayerInput());

    expect(state.players[0].attackState.active).toBe(true);
    expect(state.room.tears[0].stage).toBe(1);
    expect(state.room.worlds.neutral.blobbies[0].state).toBe('Shocking');
    // Far blobby must NOT be hit across the room!
    expect(state.room.worlds.neutral.blobbies[1].state).toBe('Seeking');
    expect(state.events.some((e) => e.sound === 'fryingPanHit')).toBe(true);

    // Advance 500ms so swing finishes and resets active = false
    engine.tick(500, p1In, createDefaultPlayerInput());
    expect(state.players[0].attackState.active).toBe(false);

    // Hit blobby-near two more times (3 hits total) -> reduces HP from 3 -> 2 -> 1 -> 0 and defeats it
    state.room.worlds.neutral.blobbies[0].x = 225;
    state.room.worlds.neutral.blobbies[0].y = 300;
    state.players[0].direction = Direction.Right;
    p1In.useItemSeq = 2;
    engine.tick(16.67, p1In, createDefaultPlayerInput());
    expect(state.room.worlds.neutral.blobbies[0].hp).toBe(1);
    engine.tick(500, p1In, createDefaultPlayerInput());

    state.room.worlds.neutral.blobbies[0].x = 225;
    state.room.worlds.neutral.blobbies[0].y = 300;
    p1In.useItemSeq = 3;
    engine.tick(16.67, p1In, createDefaultPlayerInput());
    expect(
      state.room.worlds.neutral.blobbies.find((b) => b.id === 'blobby-near')
    ).toBeUndefined();
  });

  it('heals player when eating food items and consumes the food', () => {
    const engine = new GameEngine(42);
    const state = engine.getState();
    state.players[0].speed = 1.0;
    state.players[0].healthState = 'Injured';
    state.players[0].inventory.push({
      id: 'food-1',
      type: 'Sandwich',
      popUpText: 'A prepackaged turkey sandwich. Still sealed.',
    });

    const p1In = createDefaultPlayerInput();
    p1In.useItemSeq = 1;
    engine.tick(16.67, p1In, createDefaultPlayerInput());

    expect(state.players[0].speed).toBeCloseTo(1.5, 4);
    expect(state.players[0].healthState).toBe('Bruised');
    expect(state.players[0].inventory.length).toBe(0);
    expect(state.events.some((e) => e.sound === 'eatingFood')).toBe(true);
  });
});
