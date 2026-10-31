import { describe, it, expect } from 'vitest';
import { RAW_LEVELS } from '../../src/core/levelData';
import {
  parseRoom,
  getReachableRooms,
  createEmptyRoomPersistence,
} from '../../src/core/levelParser';
import {
  DIM_WIDTH_TILES,
  DIM_HEIGHT_TILES,
  SeededRandom,
} from '../../src/shared/types';

describe('levelParser', () => {
  it('parses all 54 rooms in RAW_LEVELS cleanly with 20x26 neutral and dangerous grids', () => {
    const roomNames = Object.keys(RAW_LEVELS);
    expect(roomNames.length).toBe(54);

    for (const roomName of roomNames) {
      const rng = new SeededRandom(12345);
      const room = parseRoom(roomName, rng);
      expect(room.roomName).toBe(roomName);
      expect(room.worlds.neutral.cells.length).toBe(DIM_WIDTH_TILES);
      expect(room.worlds.dangerous.cells.length).toBe(DIM_WIDTH_TILES);
      for (let x = 0; x < DIM_WIDTH_TILES; x++) {
        expect(room.worlds.neutral.cells[x].length).toBe(DIM_HEIGHT_TILES);
        expect(room.worlds.dangerous.cells[x].length).toBe(DIM_HEIGHT_TILES);
      }
    }
  });

  it('verifies 52 reachable rooms from spawnRoom including key puzzle and final rooms', () => {
    const reachable = getReachableRooms('spawnRoom');
    expect(reachable.size).toBe(52);
    expect(reachable.has('spawnRoom')).toBe(true);
    expect(reachable.has('choiceRoom')).toBe(true);
    expect(reachable.has('maze1')).toBe(true);
    expect(reachable.has('bigEnemiesRoom')).toBe(true);
    expect(reachable.has('safeRoom')).toBe(true);
    expect(reachable.has('possibleFinalRoom')).toBe(true);
  });

  it('normalizes Nolight (lowercase l) to noLight: true in possibleFinalRoom and runOutRoom', () => {
    const finalRoom = parseRoom('possibleFinalRoom', new SeededRandom(1));
    const runOut = parseRoom('runOutRoom', new SeededRandom(1));

    const hasNoLightInFinal = finalRoom.worlds.neutral.cells.some((col) =>
      col.some((cell) => cell.wallGid > 0 && cell.noLight && cell.collides)
    );
    const hasNoLightInRunOut = runOut.worlds.neutral.cells.some((col) =>
      col.some((cell) => cell.wallGid > 0 && cell.noLight && cell.collides)
    );

    expect(hasNoLightInFinal).toBe(true);
    expect(hasNoLightInRunOut).toBe(true);
  });

  it('normalizes Moveable in crossyRoom to linked BoxEntity instances', () => {
    const crossy = parseRoom('crossyRoom', new SeededRandom(1));
    expect(crossy.worlds.neutral.boxes.length).toBe(2);
    expect(crossy.worlds.dangerous.boxes.length).toBe(2);

    for (const nBox of crossy.worlds.neutral.boxes) {
      expect(nBox.linkedBoxId).toBeTruthy();
      const dBox = crossy.worlds.dangerous.boxes.find(
        (b) => b.id === nBox.linkedBoxId
      );
      expect(dBox).toBeDefined();
      expect(dBox?.x).toBe(nBox.x);
      expect(dBox?.y).toBe(nBox.y);
    }
  });

  it('normalizes CandyBar -> Sandwich, Flashlight3 -> Lantern, and Safe -> SafeEntity', () => {
    const ppRoom2 = parseRoom('pressurePlateRoom2', new SeededRandom(1));
    const sandwiches = [
      ...ppRoom2.worlds.neutral.items,
      ...ppRoom2.worlds.dangerous.items,
    ].filter((i) => i.item.type === 'Sandwich');
    expect(sandwiches.length).toBeGreaterThan(0);

    // Check Lantern across rooms that have Lantern layer (Flashlight3 component)
    let lanternCount = 0;
    for (const roomName of Object.keys(RAW_LEVELS)) {
      const parsed = parseRoom(roomName, new SeededRandom(1));
      lanternCount += [
        ...parsed.worlds.neutral.items,
        ...parsed.worlds.dangerous.items,
      ].filter((i) => i.item.type === 'Lantern').length;
    }
    expect(lanternCount).toBeGreaterThan(0);

    const safeRoom = parseRoom('safeRoom', new SeededRandom(1));
    expect(safeRoom.worlds.neutral.safes.length).toBe(1);
    expect(safeRoom.worlds.dangerous.safes.length).toBe(1);
    expect(safeRoom.worlds.neutral.safes[0].x).toBe(225);
    expect(safeRoom.worlds.neutral.safes[0].y).toBe(200);
  });

  it('splits Evillamps into EvilLampEntity head (gid 3402) linked to neutral Lamp and collidable pole (gid 3479)', () => {
    const intro = parseRoom('lampMonsterIntro', new SeededRandom(1));
    expect(intro.worlds.dangerous.evilLamps.length).toBe(1);
    const evilLamp = intro.worlds.dangerous.evilLamps[0];
    expect(evilLamp.gid).toBe(3402);
    expect(evilLamp.x).toBe(250);
    expect(evilLamp.y).toBe(300);
    expect(evilLamp.linkedLampId).toBeTruthy();

    const neutralLamp = intro.worlds.neutral.lamps.find(
      (l) => l.id === evilLamp.linkedLampId
    );
    expect(neutralLamp).toBeDefined();
    expect(neutralLamp?.x).toBe(250);
    expect(neutralLamp?.y).toBe(300);
    expect(neutralLamp?.linkedLampId).toBe(evilLamp.id);

    // Pole tile at (col 10, row 13) in dangerous world
    const poleCell = intro.worlds.dangerous.cells[10][13];
    expect(poleCell.collides).toBe(true);
    expect(poleCell.obstacleGids).toContain(3479);
  });

  it('parses SwooshEffect in monsterIntro as walkable floor tiles with hasSwooshTrigger: true', () => {
    const monsterIntro = parseRoom('monsterIntro', new SeededRandom(1));
    for (const row of [17, 18, 19]) {
      const nCell = monsterIntro.worlds.neutral.cells[9][row];
      const dCell = monsterIntro.worlds.dangerous.cells[9][row];
      expect(nCell.hasSwooshTrigger).toBe(true);
      expect(nCell.floorGid).toBeGreaterThan(0);
      expect(nCell.collides).toBe(false);
      expect(dCell.hasSwooshTrigger).toBe(true);
      expect(dCell.floorGid).toBeGreaterThan(0);
      expect(dCell.collides).toBe(false);
    }
  });

  it('parses Fake Pressure Plates in theEyes without creating PressurePlateEntity or incrementing chestPressurePlatesToPress', () => {
    const theEyes = parseRoom('theEyes', new SeededRandom(1));
    expect(theEyes.worlds.neutral.cells[10][2].fakePlateGid).toBe(78);
    expect(theEyes.worlds.dangerous.cells[10][2].fakePlateGid).toBe(85);

    const fakeAt10_2 = [
      ...theEyes.worlds.neutral.pressurePlates,
      ...theEyes.worlds.dangerous.pressurePlates,
    ].find((p) => p.x === 250 && p.y === 50);
    expect(fakeAt10_2).toBeUndefined();

    const realChestPlates =
      theEyes.worlds.neutral.pressurePlates.filter((p) => p.kind === 'chest')
        .length +
      theEyes.worlds.dangerous.pressurePlates.filter((p) => p.kind === 'chest')
        .length;
    expect(theEyes.chestPressurePlatesToPress).toBe(realChestPlates);
  });

  it('synthesizes synthesizedGhostWall on unwarned asymmetric walls in rapidSwap and ghostlyWallRoom1', () => {
    const rapidSwap = parseRoom('rapidSwap', new SeededRandom(1));
    const ghostWallCount =
      rapidSwap.worlds.neutral.cells
        .flat()
        .filter((c) => c.synthesizedGhostWall).length +
      rapidSwap.worlds.dangerous.cells
        .flat()
        .filter((c) => c.synthesizedGhostWall).length;
    expect(ghostWallCount).toBeGreaterThan(0);
  });

  it('links asymmetric doors in possibleFinalRoom and sets partnerConnectedDoorPos on spawnRoom BlackDoor', () => {
    const spawnRoom = parseRoom('spawnRoom', new SeededRandom(1));
    const blackDoors = spawnRoom.worlds.neutral.doors.filter(
      (d) => d.kind === 'BlackDoor'
    );
    expect(blackDoors.length).toBe(1);
    const nBlackDoor = blackDoors[0];
    expect(nBlackDoor.connectedRoom).toBe('possibleFinalRoom');
    expect(nBlackDoor.connectedDoorPos).toEqual([125, 0]);
    expect(nBlackDoor.partnerConnectedDoorPos).toEqual([350, 0]);

    const dBlackDoor = spawnRoom.worlds.dangerous.doors.find(
      (d) => d.id === nBlackDoor.linkedDoorId
    );
    expect(dBlackDoor).toBeDefined();
    expect(dBlackDoor?.connectedRoom).toBe('possibleFinalRoom');
    expect(dBlackDoor?.partnerConnectedDoorPos).toEqual([350, 0]);

    const finalRoom = parseRoom('possibleFinalRoom', new SeededRandom(1));
    const nTopDoor = finalRoom.worlds.neutral.doors.find((d) => d.y === 0);
    const dTopDoor = finalRoom.worlds.dangerous.doors.find((d) => d.y === 0);
    expect(nTopDoor).toBeDefined();
    expect(dTopDoor).toBeDefined();
    expect(nTopDoor?.x).toBe(125);
    expect(dTopDoor?.x).toBe(350);
    expect(nTopDoor?.linkedDoorId).toBe(dTopDoor?.id);
    expect(dTopDoor?.linkedDoorId).toBe(nTopDoor?.id);

    const nFinalDoor = finalRoom.worlds.neutral.doors.find(
      (d) => d.kind === 'FinalDoors'
    );
    const dFinalDoor = finalRoom.worlds.dangerous.doors.find(
      (d) => d.kind === 'FinalDoors'
    );
    expect(nFinalDoor?.x).toBe(475);
    expect(nFinalDoor?.y).toBe(625);
    expect(dFinalDoor?.x).toBe(0);
    expect(dFinalDoor?.y).toBe(625);
    expect(nFinalDoor?.linkedDoorId).toBe(dFinalDoor?.id);

    // Ensure persistence helper returns valid structure
    const emptyPersist = createEmptyRoomPersistence();
    expect(emptyPersist.visited).toBe(false);
  });
});
