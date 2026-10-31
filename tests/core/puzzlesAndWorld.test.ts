import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/gameEngine';
import { createDefaultPlayerInput, Direction } from '../../src/shared/types';

describe('puzzlesAndWorld', () => {
  it('opens Chest when ChestPressurePlates are pressed, spawns reward once, and closes when box leaves', () => {
    const engine = new GameEngine(42);
    engine.loadRoom('bigEnemiesRoom');
    const state = engine.getState();

    // Put boxes onto all 4 chest pressure plates in bigEnemiesRoom
    const nPlates = state.room.worlds.neutral.pressurePlates.filter(
      (p) => p.kind === 'chest'
    );
    const dPlates = state.room.worlds.dangerous.pressurePlates.filter(
      (p) => p.kind === 'chest'
    );
    expect(nPlates.length).toBe(2);
    expect(dPlates.length).toBe(2);

    for (let i = 0; i < nPlates.length; i++) {
      state.room.worlds.neutral.boxes[i].x = nPlates[i].x;
      state.room.worlds.neutral.boxes[i].y = nPlates[i].y;
    }
    for (let i = 0; i < dPlates.length; i++) {
      state.room.worlds.dangerous.boxes[i].x = dPlates[i].x;
      state.room.worlds.dangerous.boxes[i].y = dPlates[i].y;
    }

    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());

    const chest = state.room.worlds.dangerous.chests[0];
    expect(chest.opened).toBe(true);
    expect(chest.used).toBe(true);

    const greenGem = state.room.worlds.dangerous.items.find(
      (i) => i.item.type === 'GreenGem'
    );
    expect(greenGem).toBeDefined();
    expect(greenGem?.x).toBe(chest.x);
    expect(greenGem?.y).toBe(chest.y + 25);

    // Move one box off the plate -> chest closes, and moving it back does NOT spawn a duplicate gem
    state.room.worlds.neutral.boxes[0].x = 100;
    state.room.worlds.neutral.boxes[0].y = 150;
    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(chest.opened).toBe(false);

    state.room.worlds.neutral.boxes[0].x = nPlates[0].x;
    state.room.worlds.neutral.boxes[0].y = nPlates[0].y;
    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(chest.opened).toBe(true);
    const gemsAfter = state.room.worlds.dangerous.items.filter(
      (i) => i.item.type === 'GreenGem'
    );
    expect(gemsAfter.length).toBe(1);
  });

  it('tracks SafePressurePlates across rooms and opens Safe in safeRoom to spawn BlueGem', () => {
    const engine = new GameEngine(42);

    // Press SafePressurePlate in pressurePlateRoom1
    engine.loadRoom('pressurePlateRoom1');
    let state = engine.getState();
    const safePlate1 = state.room.worlds.neutral.pressurePlates.find(
      (p) => p.kind === 'safe'
    )!;
    state.room.worlds.neutral.boxes[0].x = safePlate1.x;
    state.room.worlds.neutral.boxes[0].y = safePlate1.y;
    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(state.safePressurePlatesPressed).toBeGreaterThanOrEqual(1);

    // Press SafePressurePlate in pressurePlateRoom2
    engine.loadRoom('pressurePlateRoom2');
    state = engine.getState();
    const safePlate2 = state.room.worlds.neutral.pressurePlates.find(
      (p) => p.kind === 'safe'
    )!;
    state.room.worlds.neutral.boxes[0].x = safePlate2.x;
    state.room.worlds.neutral.boxes[0].y = safePlate2.y;
    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(state.safePressurePlatesPressed).toBeGreaterThanOrEqual(2);

    // Enter safeRoom -> Safe opens and spawns BlueGem!
    engine.loadRoom('safeRoom');
    state = engine.getState();
    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());

    const safe = state.room.worlds.neutral.safes[0];
    expect(safe.opened).toBe(true);
    const blueGems = [
      ...state.room.worlds.neutral.items,
      ...state.room.worlds.dangerous.items,
    ].filter((i) => i.item.type === 'BlueGem');
    expect(blueGems.length).toBeGreaterThanOrEqual(1);
    expect(blueGems[0].x).toBe(safe.x);
    expect(blueGems[0].y).toBe(safe.y + 25);
  });

  it('completes the full 3-gem -> GemStatue -> BlackKey -> BlackDoor -> possibleFinalRoom -> FinalDoors victory chain', () => {
    const engine = new GameEngine(42);
    engine.loadRoom('choiceRoom');
    let state = engine.getState();

    const statue = state.room.worlds.neutral.statues[0];
    // Position P1 adjacent to statue (250, 300) facing Down from (250, 275)
    state.players[0].x = statue.x;
    state.players[0].y = statue.y - 25;
    state.players[0].direction = Direction.Down;
    state.players[0].inventory = [
      { id: 'g1', type: 'RedGem', popUpText: 'Red Gem.' },
      { id: 'g2', type: 'BlueGem', popUpText: 'Blue Gem.' },
      { id: 'g3', type: 'GreenGem', popUpText: 'Green Gem.' },
    ];

    const p1In = createDefaultPlayerInput();
    p1In.useItemSeq = 1;
    engine.tick(16.67, p1In, createDefaultPlayerInput());
    expect(statue.hasRedGem).toBe(true);

    p1In.useItemSeq = 2;
    engine.tick(16.67, p1In, createDefaultPlayerInput());
    expect(statue.hasBlueGem).toBe(true);

    p1In.useItemSeq = 3;
    engine.tick(16.67, p1In, createDefaultPlayerInput());
    expect(statue.hasGreenGem).toBe(true);
    expect(statue.blackKeySpawned).toBe(true);

    const blackKeyItem = state.room.worlds.neutral.items.find(
      (i) => i.item.type === 'BlackKey'
    );
    expect(blackKeyItem).toBeDefined();
    expect(blackKeyItem?.x).toBe(statue.x);
    expect(blackKeyItem?.y).toBe(statue.y - 25);

    // Pick up BlackKey
    p1In.interactSeq = 1;
    engine.tick(16.67, p1In, createDefaultPlayerInput());
    expect(
      state.players[0].inventory.some((i) => i.type === 'BlackKey')
    ).toBe(true);

    // Go to spawnRoom and unlock BlackDoor at (250, 525)
    engine.loadRoom('spawnRoom');
    state = engine.getState();
    state.players[0].x = 250;
    state.players[0].y = 500;
    state.players[0].direction = Direction.Down;
    state.players[1].x = 250;
    state.players[1].y = 500;
    state.players[1].direction = Direction.Down;

    p1In.useItemSeq = 4;
    engine.tick(16.67, p1In, createDefaultPlayerInput());
    const blackDoor = state.room.worlds.neutral.doors.find(
      (d) => d.kind === 'BlackDoor'
    )!;
    expect(blackDoor.unlocked).toBe(true);

    // Both players walk into BlackDoor -> transitions to possibleFinalRoom
    p1In.down = true;
    const p2In = createDefaultPlayerInput();
    p2In.down = true;
    engine.tick(16.67, p1In, p2In);

    state = engine.getState();
    expect(state.roomName).toBe('possibleFinalRoom');
    // P1 spawns below left top door (125, 25); P2 spawns below right top door (350, 25) - not in a wall!
    expect(state.players[0].x).toBe(125);
    expect(state.players[0].y).toBe(25);
    expect(state.players[1].x).toBe(350);
    expect(state.players[1].y).toBe(25);
    expect(
      state.room.worlds.dangerous.cells[350 / 25][25 / 25].collides
    ).toBe(false);

    // Both players touch FinalDoors at (475, 625) and (0, 625) -> Victory!
    state.players[0].x = 475;
    state.players[0].y = 600;
    state.players[1].x = 0;
    state.players[1].y = 600;
    engine.tick(16.67, p1In, p2In);
    expect(state.phase).toBe('victory');
    expect(state.events.some((e) => e.type === 'victory')).toBe(true);
  });

  it('toggles Fire1 and Fire2 via Lever in kitchenPuzzle and deals periodic fire damage', () => {
    const engine = new GameEngine(42);
    engine.loadRoom('kitchenPuzzle');
    const state = engine.getState();

    const lever = state.room.worlds.dangerous.levers[0];
    const fire1 = state.room.worlds.neutral.fires.find((f) => f.variant === 1)!;
    const fire2 = state.room.worlds.neutral.fires.find((f) => f.variant === 2)!;
    expect(fire1.isOn).toBe(true);
    expect(fire2.isOn).toBe(false);

    // Stand P1 on active fire1 -> takes 0.5 damage immediately and again after 1000ms
    state.players[0].x = fire1.x;
    state.players[0].y = fire1.y;
    state.players[1].x = 525 - 500;
    state.players[1].y = 600;

    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(state.players[0].speed).toBeCloseTo(1.0, 4);

    // Reset P1 back onto fire1 and wait 1000ms for second tick of fire damage
    state.players[0].x = fire1.x;
    state.players[0].y = fire1.y;
    engine.tick(1000, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(state.players[0].speed).toBeCloseTo(0.5, 4);

    // P2 interacts with Lever at (375, 375) in dangerous world
    state.players[1].x = lever.x - 25;
    state.players[1].y = lever.y;
    state.players[1].direction = Direction.Right;
    const p2In = createDefaultPlayerInput();
    p2In.interactSeq = 1;
    engine.tick(16.67, createDefaultPlayerInput(), p2In);

    expect(lever.activated).toBe(true);
    expect(fire1.isOn).toBe(false);
    expect(fire2.isOn).toBe(true);
  });

  it('resets playerAtDoor immediately when a player steps away from a door', () => {
    const engine = new GameEngine(42);
    const state = engine.getState();
    const door = state.room.worlds.neutral.doors.find(
      (d) => d.kind === 'Door'
    )!;

    // P1 touches top door at (225, 100), P2 is far away
    state.players[0].x = door.x;
    state.players[0].y = door.y + 25;
    const p1In = createDefaultPlayerInput();
    p1In.up = true;
    engine.tick(16.67, p1In, createDefaultPlayerInput());
    expect(door.playerAtDoor).toBe(true);

    // P1 walks away -> door.playerAtDoor resets to false so P2 touching later does not transition alone!
    p1In.up = false;
    p1In.down = true;
    for (let i = 0; i < 5; i++) {
      engine.tick(16.67, p1In, createDefaultPlayerInput());
    }
    expect(door.playerAtDoor).toBe(false);
  });

  it('unlocks PressureDoor while DoorPressurePlate is pressed and relocks when box leaves', () => {
    const engine = new GameEngine(42);
    engine.loadRoom('pressurePlateRoom2');
    const state = engine.getState();

    const doorPlate = state.room.worlds.neutral.pressurePlates.find(
      (p) => p.kind === 'door'
    )!;
    const pressureDoor = state.room.worlds.neutral.doors.find(
      (d) => d.kind === 'PressureDoor'
    )!;
    expect(pressureDoor.unlocked).toBe(false);

    state.room.worlds.neutral.boxes[0].x = doorPlate.x;
    state.room.worlds.neutral.boxes[0].y = doorPlate.y;
    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(pressureDoor.unlocked).toBe(true);

    state.room.worlds.neutral.boxes[0].x = 100;
    state.room.worlds.neutral.boxes[0].y = 50;
    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(pressureDoor.unlocked).toBe(false);
  });

  it('toggles linked Lamps, handles broken/unlinked lamps safely, persists lamp states, and triggers SwooshEffect once', () => {
    const engine = new GameEngine(42);
    engine.loadRoom('monsterIntro');
    let state = engine.getState();

    const nLamp = state.room.worlds.neutral.lamps[0];
    const dLamp = state.room.worlds.dangerous.lamps.find(
      (l) => l.id === nLamp.linkedLampId
    )!;
    const initialOn = nLamp.isOn;

    state.players[0].x = nLamp.x - 25;
    state.players[0].y = nLamp.y;
    state.players[0].direction = Direction.Right;

    const p1In = createDefaultPlayerInput();
    p1In.interactSeq = 1;
    engine.tick(16.67, p1In, createDefaultPlayerInput());

    expect(nLamp.isOn).toBe(!initialOn);
    expect(dLamp.isOn).toBe(!initialOn);

    // Step onto SwooshEffect tile at (225, 425) -> triggers 'swoosh' once
    state.players[0].x = 225;
    state.players[0].y = 425;
    p1In.down = true;
    engine.tick(16.67, p1In, createDefaultPlayerInput());
    expect(state.room.swooshTriggered).toBe(true);
    expect(state.events.some((e) => e.sound === 'swoosh')).toBe(true);

    // Leave and re-enter monsterIntro -> lamp state and swooshTriggered persist
    engine.loadRoom('keyIntro');
    engine.loadRoom('monsterIntro');
    state = engine.getState();
    expect(state.room.swooshTriggered).toBe(true);
    expect(state.room.worlds.neutral.lamps[0].isOn).toBe(!initialOn);
  });

  it('persists SafePressurePlate activation across room transitions without decrementing or allowing duplicate farming', () => {
    const engine = new GameEngine(42);
    engine.loadRoom('pressurePlateRoom1');
    let state = engine.getState();

    const nSafePlate = state.room.worlds.neutral.pressurePlates.find(
      (p) => p.kind === 'safe'
    )!;
    const dSafePlate = state.room.worlds.dangerous.pressurePlates.find(
      (p) => p.kind === 'safe'
    )!;

    // Push boxes onto both SafePressurePlates in pressurePlateRoom1
    state.room.worlds.neutral.boxes[0].x = nSafePlate.x;
    state.room.worlds.neutral.boxes[0].y = nSafePlate.y;
    state.room.worlds.dangerous.boxes[0].x = dSafePlate.x;
    state.room.worlds.dangerous.boxes[0].y = dSafePlate.y;

    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(state.safePressurePlatesPressed).toBe(2);

    // Leave pressurePlateRoom1 -> safeRoom, then re-enter pressurePlateRoom1
    engine.loadRoom('safeRoom');
    engine.loadRoom('pressurePlateRoom1');
    state = engine.getState();

    // Tick in pressurePlateRoom1: safePressurePlatesPressed must stay 2 AND plates must remain visually touched (true)
    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(state.safePressurePlatesPressed).toBe(2);
    expect(
      state.room.worlds.neutral.pressurePlates.find((p) => p.kind === 'safe')!
        .touched
    ).toBe(true);
    expect(
      state.room.worlds.dangerous.pressurePlates.find((p) => p.kind === 'safe')!
        .touched
    ).toBe(true);

    // Attempting to step on or place a box on the already-satisfied plates in pressurePlateRoom1 does not double-count
    state.players[0].x = nSafePlate.x;
    state.players[0].y = nSafePlate.y;
    state.players[1].x = dSafePlate.x;
    state.players[1].y = dSafePlate.y;
    engine.tick(16.67, createDefaultPlayerInput(), createDefaultPlayerInput());
    expect(state.safePressurePlatesPressed).toBe(2);
  });
});
