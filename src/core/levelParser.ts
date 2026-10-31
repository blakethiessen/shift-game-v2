// src/core/levelParser.ts
// Pure TypeScript parser for RAW_LEVELS Tiled JSON room definitions.
// Normalizes legacy component/layer inconsistencies, synthesizes ghost wall flags,
// and links cross-dimension doors, boxes, lamps, and evilLamps.

import { RAW_LEVELS } from './levelData';
import {
  BookEntity,
  BookKind,
  BoxEntity,
  ChestEntity,
  DIM_HEIGHT_TILES,
  DIM_WIDTH_TILES,
  Direction,
  DoorEntity,
  DoorKind,
  EvilLampEntity,
  FireEntity,
  GemStatueEntity,
  GridCell,
  ItemData,
  ItemEntity,
  ItemType,
  LampEntity,
  LeverEntity,
  PressurePlateEntity,
  PressurePlateKind,
  RoomPersistenceState,
  RoomState,
  SafeEntity,
  SeededRandom,
  TILE_SIZE_PX,
  WorldGridState,
  WorldType,
} from '../shared/types';

const DOOR_KINDS: ReadonlySet<string> = new Set<DoorKind>([
  'Door',
  'LockedDoor',
  'PressureDoor',
  'BlackDoor',
  'FinalDoors',
]);

const BOOK_TEXTS: Record<BookKind, string> = {
  ChestBook:
    'This chest is locked! To open it, activate all of the pressure plates and levers in the room.',
  SpawnBook:
    'This door will take you back to the first room you entered in. You don’t have to complete the tutorial in reverse!',
  StatueBook:
    'Good job on finishing the tutorials, now your goal is to find the 3 colored gems and place them in this statue. The black doors at the beginning can only be unlocked with the black key hidden in this statue!',
  KeyBook:
    'The door ahead is locked! There’s a key somewhere in here... Either player may unlock a door, as both doors will remain unlocked afterwards.',
  EvillampBook:
    'That’s not a real lamp! Beware standing too close to it for too long!',
  MonsterBook:
    'Woah! There are dangerous monsters in the evil dimension. Caution up ahead.',
  PressureBook:
    'This door is locked by a pressure mechanism and cannot be opened with a key! Find the pressure plate and activate it to move on.',
  PushableBook:
    'Boxes in the world are moveable by your character. Things that you push in one dimension also move in the other!',
  WallOverlayBook:
    'Not all of the features of the world are the same in both dimensions. Those transparent looking walls are safe to walk on, but beware shifting dimensions on them!',
  FlashlightBook:
    'This flashlight will be your friend. Pick it up by interacting with it and pressing “Q” or “,” when the text appears.',
  FoodBook:
    'Health is shared between both players. Food will heal you both for 25% of your health. Pick it up by interacting and pressing “Q” or “,” when the text appears. “E” or “.” will eat it, restoring health.',
  BlackBook:
    'This door is your ultimate goal and salvation from the colliding of the dimensions! It is locked though; only a special black key may open it. Explore the world and find the key to escape!',
};

const ITEM_TEXTS: Record<ItemType, string> = {
  Broom: 'A sturdy broom',
  FryingPan: 'A frying pan, used mainly for hitting things',
  Plunger: 'A sturdy plunger, great for plunging toilets',
  Key: 'This could unlock a door.',
  BlackKey: 'This looks like it could unlock the front door.',
  RedGem: 'Red Gem.',
  BlueGem: 'Blue Gem.',
  GreenGem: 'Green Gem.',
  Chips: 'A bag of chips. 0 trans fats.',
  WaterBottle: 'A lukewarm water bottle.',
  Sandwich: 'A prepackaged turkey sandwich. Still sealed.',
  Lollipop: 'A round little lollipop.',
  Flashlight: 'A flashlight. Useful for lighting up dark areas.',
  Flashlight2: 'A brighter flashlight. Useful for lighting up dark areas.',
  Lantern: 'A lantern, useful for seeing around you.',
};

const DOOR_TEXTS: Record<DoorKind, string> = {
  Door: 'An unlocked door (both players must stand next to it).',
  LockedDoor: 'The door is locked.',
  PressureDoor: "The door is locked, but there's no keyhole.",
  BlackDoor: "An ominous black door. It's locked.",
  FinalDoors: 'The door outside.',
};

export const BASE_STATUE_TEXT =
  'A tall, majestic statue. It has 3 gem-shaped slots in its base.';

export function formatStatuePopUpText(statue: {
  hasRedGem: boolean;
  hasBlueGem: boolean;
  hasGreenGem: boolean;
}): string {
  let text = BASE_STATUE_TEXT;
  if (statue.hasRedGem) {
    text += ' A red gem is inserted.';
  }
  if (statue.hasBlueGem) {
    text += ' A blue gem is inserted.';
  }
  if (statue.hasGreenGem) {
    text += ' A green gem is inserted.';
  }
  return text;
}

export function getDefaultItemPopUpText(type: ItemType): string {
  return ITEM_TEXTS[type];
}

export function getDefaultItemGid(
  type: ItemType,
  world: WorldType,
  lollipopColor?: 'green' | 'red' | 'blue'
): number {
  const offset = world === 'dangerous' ? 7 : 0;
  switch (type) {
    case 'Flashlight':
      return 3390 + offset;
    case 'Flashlight2':
      return 3391 + offset;
    case 'Lantern':
      return 3392 + offset;
    case 'BlackKey':
      return 3467 + offset;
    case 'Key':
      return 3468 + offset;
    case 'GreenGem':
      return 3544 + offset;
    case 'BlueGem':
      return 3545 + offset;
    case 'RedGem':
      return 3546 + offset;
    case 'Chips':
      return 3621 + offset;
    case 'Plunger':
      return 3623 + offset;
    case 'Broom':
      return 3624 + offset;
    case 'WaterBottle':
      return 3698 + offset;
    case 'Sandwich':
      return 3699 + offset;
    case 'FryingPan':
      return 3700 + offset;
    case 'Lollipop':
      if (lollipopColor === 'red') return 3776 + offset;
      if (lollipopColor === 'blue') return 3852 + offset;
      return 3775 + offset;
  }
}

export function createEmptyRoomPersistence(): RoomPersistenceState {
  return {
    visited: false,
    removedItemCoords: [],
    addedItems: [],
    unlockedDoorCoords: [],
    lamps: [],
    blobbies: [],
    tears: [],
    chests: {},
    safeOpened: false,
    statue: {
      hasRedGem: false,
      hasBlueGem: false,
      hasGreenGem: false,
      blackKeySpawned: false,
    },
    safePlatesPressedIds: [],
    swooshTriggered: false,
  };
}

function createEmptyGridCell(): GridCell {
  return {
    floorGid: 0,
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

function createEmptyWorldGrid(world: WorldType): WorldGridState {
  const cells: GridCell[][] = [];
  for (let x = 0; x < DIM_WIDTH_TILES; x++) {
    const col: GridCell[] = [];
    for (let y = 0; y < DIM_HEIGHT_TILES; y++) {
      col.push(createEmptyGridCell());
    }
    cells.push(col);
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

function normalizeComponentName(comp: string): string {
  const trimmed = comp.trim();
  if (trimmed === 'Nolight') return 'NoLight';
  if (trimmed === 'Moveable') return 'Box';
  if (trimmed === 'CandyBar') return 'Sandwich';
  if (trimmed === 'Flashlight3') return 'Lantern';
  if (trimmed === 'FlashLight2') return 'Flashlight2';
  return trimmed;
}

function inferLollipopColor(gid: number): 'green' | 'red' | 'blue' {
  const col = (gid - 1) % 77;
  const row = Math.floor((gid - 1) / 77);
  if (row === 50) return 'blue';
  if (col === 2 || col === 9) return 'red';
  return 'green';
}

export function getReachableRooms(startRoom: string = 'spawnRoom'): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [];
  if (RAW_LEVELS[startRoom]) {
    visited.add(startRoom);
    queue.push(startRoom);
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    const rawDef = RAW_LEVELS[current];
    if (!rawDef) continue;
    for (const door of rawDef.doors) {
      if (
        door.connectedRoom &&
        RAW_LEVELS[door.connectedRoom] &&
        !visited.has(door.connectedRoom)
      ) {
        visited.add(door.connectedRoom);
        queue.push(door.connectedRoom);
      }
    }
  }
  return visited;
}

export function parseRoom(
  roomName: string,
  rng: SeededRandom = new SeededRandom(0x5f3759df),
  persistence?: RoomPersistenceState
): RoomState {
  const rawDef = RAW_LEVELS[roomName];
  if (!rawDef) {
    throw new Error(`Unknown room "${roomName}" in RAW_LEVELS`);
  }

  const neutral = createEmptyWorldGrid('neutral');
  const dangerous = createEmptyWorldGrid('dangerous');

  let chestPressurePlatesToPress = 0;
  let entitySeq = 0;

  for (const layer of rawDef.room.layers) {
    const rawComps = layer.properties?.Components ?? '';
    const comps = rawComps
      .split(',')
      .map(normalizeComponentName)
      .filter((c) => c.length > 0);
    const compSet = new Set(comps);

    const mapWidth = layer.width || 40;

    for (let i = 0; i < layer.data.length; i++) {
      const gid = layer.data[i];
      if (!gid) continue;

      const rawCol = i % mapWidth;
      const row = Math.floor(i / mapWidth);
      if (row < 0 || row >= DIM_HEIGHT_TILES) continue;

      const isNeutral = rawCol < DIM_WIDTH_TILES;
      const localCol = isNeutral ? rawCol : rawCol - DIM_WIDTH_TILES;
      if (localCol < 0 || localCol >= DIM_WIDTH_TILES) continue;

      const world: WorldType = isNeutral ? 'neutral' : 'dangerous';
      const worldGrid = isNeutral ? neutral : dangerous;
      const cell = worldGrid.cells[localCol][row];
      const localX = localCol * TILE_SIZE_PX;
      const localY = row * TILE_SIZE_PX;

      // 1. Structural & overlay layers
      if (layer.name === 'Floor') {
        cell.floorGid = gid;
        continue;
      }
      if (layer.name === 'Walls') {
        cell.wallGid = gid;
        cell.collides = true;
        cell.noLight = true;
        continue;
      }
      if (layer.name === 'Wall Overlay') {
        cell.wallOverlayGid = gid;
        continue;
      }
      if (layer.name === 'Fake Pressure Plates') {
        cell.fakePlateGid = gid;
        continue;
      }
      if (compSet.has('SwooshEffect') || layer.name === 'Swoosh Sound Effect') {
        cell.hasSwooshTrigger = true;
        if (cell.floorGid === 0) {
          cell.floorGid = gid;
        }
        continue;
      }
      if (compSet.has('WallDoor')) {
        cell.wallDoorGid = gid;
        cell.isWallDoor = true;
        cell.collides = true;
        if (compSet.has('NoLight')) {
          cell.noLight = true;
        }
        continue;
      }
      if (compSet.has('Hole')) {
        cell.holeGid = gid;
        cell.isHole = true;
        cell.collides = true;
        continue;
      }

      // 2. Doors
      const doorKind = comps.find((c): c is DoorKind => DOOR_KINDS.has(c));
      if (doorKind) {
        const door: DoorEntity = {
          id: `${roomName}_door_${world}_${localX}_${localY}_${++entitySeq}`,
          kind: doorKind,
          world,
          x: localX,
          y: localY,
          gid,
          unlocked: doorKind === 'Door' || doorKind === 'FinalDoors',
          playerAtDoor: false,
          connectedRoom: null,
          connectedDoorPos: null,
          partnerConnectedDoorPos: null,
          entranceDirection: null,
          linkedDoorId: null,
          popUpText: DOOR_TEXTS[doorKind],
        };
        worldGrid.doors.push(door);
        continue;
      }

      // 3. Moveable Boxes
      if (compSet.has('Box')) {
        const box: BoxEntity = {
          id: `${roomName}_box_${world}_${localX}_${localY}_${++entitySeq}`,
          world,
          x: localX,
          y: localY,
          gid,
          linkedBoxId: null,
        };
        worldGrid.boxes.push(box);
        continue;
      }

      // 4. EvilLamps (2-tile split: 3402 head + 3479 collidable pole)
      if (compSet.has('EvilLamp') || layer.name === 'Evillamps') {
        if (gid === 3402) {
          const evilLamp: EvilLampEntity = {
            id: `${roomName}_evillamp_${world}_${localX}_${localY}_${++entitySeq}`,
            world,
            x: localX,
            y: localY,
            gid,
            isOn: false,
            linkedLampId: null,
            stage: 'dormant',
            timerMs: 0,
            popUpText:
              'A normal-looking lamp. It should be able to turn on and off.',
          };
          worldGrid.evilLamps.push(evilLamp);
        } else {
          // gid === 3479 pole
          cell.collides = true;
          cell.obstacleGids.push(gid);
        }
        continue;
      }

      // 5. Lamps & BrokenLamps
      if (compSet.has('Lamp') || compSet.has('BrokenLamp')) {
        const isBroken = compSet.has('BrokenLamp');
        const lamp: LampEntity = {
          id: `${roomName}_lamp_${world}_${localX}_${localY}_${++entitySeq}`,
          world,
          x: localX,
          y: localY,
          gid,
          isOn: false,
          isBroken,
          linkedLampId: null,
          popUpText: isBroken
            ? 'A lamp, but it appears to be broken.'
            : 'A normal-looking lamp. It should be able to turn on and off.',
        };
        worldGrid.lamps.push(lamp);
        if (compSet.has('Collides') || isBroken) {
          cell.collides = true;
        }
        continue;
      }

      // 6. Pressure Plates
      if (
        compSet.has('ChestPressurePlate') ||
        compSet.has('DoorPressurePlate') ||
        compSet.has('SafePressurePlate')
      ) {
        const kind: PressurePlateKind = compSet.has('ChestPressurePlate')
          ? 'chest'
          : compSet.has('DoorPressurePlate')
            ? 'door'
            : 'safe';
        if (kind === 'chest') {
          chestPressurePlatesToPress++;
        }
        const plate: PressurePlateEntity = {
          id: `${roomName}_plate_${kind}_${world}_${localX}_${localY}`,
          kind,
          world,
          x: localX,
          y: localY,
          gid,
          touched: false,
          popUpText:
            "It looks like a pressure plate. It'll need something heavy on it.",
        };
        worldGrid.pressurePlates.push(plate);
        continue;
      }

      // 7. Levers
      if (compSet.has('Lever')) {
        const lever: LeverEntity = {
          id: `${roomName}_lever_${world}_${localX}_${localY}_${++entitySeq}`,
          world,
          x: localX,
          y: localY,
          gid,
          activated: false,
          popUpText: 'A metal lever. It must be connected to something.',
        };
        worldGrid.levers.push(lever);
        continue;
      }

      // 8. Chests
      if (compSet.has('Chest')) {
        const chest: ChestEntity = {
          id: `${roomName}_chest_${world}_${localX}_${localY}`,
          world,
          x: localX,
          y: localY,
          gid,
          opened: false,
          used: false,
          popUpText:
            "A locked chest. There's no keyhole, but there must be a way to open it.",
        };
        worldGrid.chests.push(chest);
        cell.collides = true;
        continue;
      }

      // 9. Safe
      if (compSet.has('Safe') || layer.name === 'Safe') {
        const safe: SafeEntity = {
          id: `${roomName}_safe_${world}_${localX}_${localY}`,
          world,
          x: localX,
          y: localY,
          gid,
          opened: false,
          popUpText:
            "A secure safe, it's secrets hidden behind a mysterious lock.",
        };
        worldGrid.safes.push(safe);
        cell.collides = true;
        continue;
      }

      // 10. Fires
      if (compSet.has('Fire1') || compSet.has('Fire2')) {
        const variant: 1 | 2 = compSet.has('Fire1') ? 1 : 2;
        const fire: FireEntity = {
          id: `${roomName}_fire_${variant}_${world}_${localX}_${localY}_${++entitySeq}`,
          world,
          x: localX,
          y: localY,
          gid,
          variant,
          isOn: variant === 1,
          damageTimerMs: 0,
        };
        worldGrid.fires.push(fire);
        continue;
      }

      // 11. Gem Statue
      if (compSet.has('GemStatue')) {
        const statue: GemStatueEntity = {
          id: `${roomName}_statue_${world}_${localX}_${localY}`,
          world,
          x: localX,
          y: localY,
          gid,
          hasRedGem: false,
          hasBlueGem: false,
          hasGreenGem: false,
          blackKeySpawned: false,
          popUpText: BASE_STATUE_TEXT,
        };
        worldGrid.statues.push(statue);
        cell.collides = true;
        continue;
      }

      // 12. Books
      const bookKind = comps.find((c): c is BookKind => c in BOOK_TEXTS);
      if (bookKind) {
        const book: BookEntity = {
          id: `${roomName}_book_${bookKind}_${world}_${localX}_${localY}_${++entitySeq}`,
          kind: bookKind,
          world,
          x: localX,
          y: localY,
          gid,
          popUpText: BOOK_TEXTS[bookKind],
        };
        worldGrid.books.push(book);
        continue;
      }

      // 13. Items
      const itemType = comps.find((c): c is ItemType => c in ITEM_TEXTS);
      if (itemType) {
        const itemData: ItemData = {
          id: `${roomName}_item_${itemType}_${world}_${localX}_${localY}_${++entitySeq}`,
          type: itemType,
          popUpText: ITEM_TEXTS[itemType],
          ...(itemType === 'Lollipop'
            ? { lollipopColor: inferLollipopColor(gid) }
            : {}),
        };
        const itemEntity: ItemEntity = {
          id: itemData.id,
          world,
          x: localX,
          y: localY,
          gid,
          item: itemData,
        };
        worldGrid.items.push(itemEntity);
        continue;
      }

      // 14. Monsters (Blobby)
      if (compSet.has('Blobby')) {
        worldGrid.blobbies.push({
          id: `${roomName}_blobby_${world}_${localX}_${localY}_${++entitySeq}`,
          world,
          x: localX,
          y: localY,
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
        });
        continue;
      }

      // 15. Generic Collides obstacles (tables, chairs, counters, lamp bases)
      if (compSet.has('Collides')) {
        cell.collides = true;
        cell.obstacleGids.push(gid);
        if (compSet.has('NoLight')) {
          cell.noLight = true;
        }
      }
    }
  }

  // Synthesize ghost wall flags where one world has a solid wall (collides && noLight && !isWallDoor)
  // and the opposite world has a walkable non-colliding floor tile and wallOverlayGid === 0.
  for (let x = 0; x < DIM_WIDTH_TILES; x++) {
    for (let y = 0; y < DIM_HEIGHT_TILES; y++) {
      const nCell = neutral.cells[x][y];
      const dCell = dangerous.cells[x][y];

      const nIsSolidWall =
        nCell.collides && nCell.noLight && !nCell.isWallDoor;
      const dIsSolidWall =
        dCell.collides && dCell.noLight && !dCell.isWallDoor;

      const nIsWalkableFloor =
        nCell.floorGid > 0 &&
        !nCell.collides &&
        !nCell.noLight &&
        !nCell.isHole &&
        !nCell.isWallDoor;
      const dIsWalkableFloor =
        dCell.floorGid > 0 &&
        !dCell.collides &&
        !dCell.noLight &&
        !dCell.isHole &&
        !dCell.isWallDoor;

      if (nIsSolidWall && dIsWalkableFloor && dCell.wallOverlayGid === 0) {
        dCell.synthesizedGhostWall = true;
      }
      if (dIsSolidWall && nIsWalkableFloor && nCell.wallOverlayGid === 0) {
        nCell.synthesizedGhostWall = true;
      }
    }
  }

  // Match RAW_LEVELS[roomName].doors definitions to neutral doors
  for (const rawDoor of rawDef.doors) {
    const [cx, cy] = rawDoor.coor;
    const nDoor = neutral.doors.find((d) => d.x === cx && d.y === cy);
    if (nDoor) {
      nDoor.connectedRoom = rawDoor.connectedRoom;
      nDoor.connectedDoorPos = [
        rawDoor.connectedDoor[0],
        rawDoor.connectedDoor[1],
      ];
      nDoor.entranceDirection = rawDoor.entranceDirection;
      if (rawDoor.connectedRoom === 'possibleFinalRoom') {
        nDoor.partnerConnectedDoorPos = [350, 0];
      }
    }
  }

  // Link cross-dimension doors: match by (localX, y) first, fallback to same y + same DoorKind
  for (const nDoor of neutral.doors) {
    let dDoor = dangerous.doors.find(
      (dd) => !dd.linkedDoorId && dd.x === nDoor.x && dd.y === nDoor.y
    );
    if (!dDoor) {
      dDoor = dangerous.doors.find(
        (dd) => !dd.linkedDoorId && dd.y === nDoor.y && dd.kind === nDoor.kind
      );
    }
    if (dDoor) {
      nDoor.linkedDoorId = dDoor.id;
      dDoor.linkedDoorId = nDoor.id;
      dDoor.connectedRoom = nDoor.connectedRoom;
      dDoor.connectedDoorPos = nDoor.connectedDoorPos
        ? [...nDoor.connectedDoorPos]
        : null;
      dDoor.partnerConnectedDoorPos = nDoor.partnerConnectedDoorPos
        ? [...nDoor.partnerConnectedDoorPos]
        : null;
      dDoor.entranceDirection = nDoor.entranceDirection;
    }
  }

  // Link cross-dimension boxes by (localX, y)
  for (const nBox of neutral.boxes) {
    const dBox = dangerous.boxes.find(
      (db) => !db.linkedBoxId && db.x === nBox.x && db.y === nBox.y
    );
    if (dBox) {
      nBox.linkedBoxId = dBox.id;
      dBox.linkedBoxId = nBox.id;
    }
  }

  // Link cross-dimension lamps & evilLamps by (localX, y) and initialize 50/50 isOn state
  for (const nLamp of neutral.lamps) {
    if (nLamp.isBroken) continue;
    const dLamp = dangerous.lamps.find(
      (dl) =>
        !dl.isBroken &&
        !dl.linkedLampId &&
        dl.x === nLamp.x &&
        dl.y === nLamp.y
    );
    if (dLamp) {
      nLamp.linkedLampId = dLamp.id;
      dLamp.linkedLampId = nLamp.id;
      const isOn = rng.nextFloat() > 0.5;
      nLamp.isOn = isOn;
      dLamp.isOn = isOn;
      continue;
    }
    const dEvilLamp = dangerous.evilLamps.find(
      (el) => !el.linkedLampId && el.x === nLamp.x && el.y === nLamp.y
    );
    if (dEvilLamp) {
      nLamp.linkedLampId = dEvilLamp.id;
      dEvilLamp.linkedLampId = nLamp.id;
      const isOn = rng.nextFloat() > 0.5;
      nLamp.isOn = isOn;
      dEvilLamp.isOn = isOn;
    }
  }

  const room: RoomState = {
    roomName,
    worlds: {
      neutral,
      dangerous,
    },
    tears: [],
    pendingRegrowths: [],
    blobbySpawnTimerMs: 0,
    chestPressurePlatesToPress,
    chestPressurePlatesPressed: 0,
    swooshTriggered: false,
  };

  if (persistence) {
    applyRoomPersistence(room, persistence);
  }

  return room;
}

export function applyRoomPersistence(
  room: RoomState,
  persistence: RoomPersistenceState
): void {
  room.swooshTriggered = persistence.swooshTriggered;

  // 1. Remove previously picked-up items
  for (const rem of persistence.removedItemCoords) {
    const grid = room.worlds[rem.world];
    const idx = grid.items.findIndex(
      (i) => i.x === rem.x && i.y === rem.y && i.item.type === rem.type
    );
    if (idx !== -1) {
      grid.items.splice(idx, 1);
    }
  }

  // 2. Add dropped / spawned items
  for (const added of persistence.addedItems) {
    const grid = room.worlds[added.world];
    const exists = grid.items.some((i) => i.id === added.id);
    if (!exists) {
      grid.items.push({
        id: added.id,
        world: added.world,
        x: added.x,
        y: added.y,
        gid: getDefaultItemGid(
          added.item.type,
          added.world,
          added.item.lollipopColor
        ),
        item: { ...added.item },
      });
    }
  }

  // 3. Unlock previously unlocked doors
  for (const unlocked of persistence.unlockedDoorCoords) {
    const grid = room.worlds[unlocked.world];
    const door = grid.doors.find(
      (d) => d.x === unlocked.x && d.y === unlocked.y
    );
    if (door) {
      door.unlocked = true;
      door.popUpText =
        door.kind === 'BlackDoor'
          ? 'The black door is unlocked!'
          : 'The door is unlocked!';
      const otherGrid =
        unlocked.world === 'neutral'
          ? room.worlds.dangerous
          : room.worlds.neutral;
      const linked = otherGrid.doors.find((d) => d.id === door.linkedDoorId);
      if (linked) {
        linked.unlocked = true;
        linked.popUpText = door.popUpText;
      }
    }
  }

  // 4. Restore lamp & evilLamp states
  if (persistence.lamps.length > 0) {
    for (const savedLamp of persistence.lamps) {
      const grid = room.worlds[savedLamp.world];
      const lamp = grid.lamps.find(
        (l) => l.x === savedLamp.x && l.y === savedLamp.y
      );
      if (lamp) {
        lamp.isOn = savedLamp.isOn;
      }
      const evilLamp = grid.evilLamps.find(
        (el) => el.x === savedLamp.x && el.y === savedLamp.y
      );
      if (evilLamp) {
        evilLamp.isOn = savedLamp.isOn;
      }
    }
  }

  // 5. Restore blobbies if room was previously visited and saved blobbies
  if (persistence.visited && persistence.blobbies.length > 0) {
    room.worlds.neutral.blobbies = [];
    room.worlds.dangerous.blobbies = [];
    let idx = 0;
    for (const b of persistence.blobbies) {
      room.worlds[b.world].blobbies.push({
        id: `${room.roomName}_persisted_blobby_${++idx}`,
        world: b.world,
        x: b.x,
        y: b.y,
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
      });
    }
  }

  // 6. Restore tears
  if (persistence.tears.length > 0) {
    let tIdx = 0;
    for (const savedTear of persistence.tears) {
      const alreadyExists = room.tears.some(
        (t) => t.x === savedTear.x && t.y === savedTear.y
      );
      if (!alreadyExists) {
        room.tears.push({
          id: `${room.roomName}_persisted_tear_${++tIdx}`,
          x: savedTear.x,
          y: savedTear.y,
          angle: savedTear.angle,
          stage: savedTear.stage,
          growthTimerMs: 3000,
          hasSpread: savedTear.stage >= 4,
        });
      }
    }
  }

  // 7. Restore chest states
  for (const chest of [
    ...room.worlds.neutral.chests,
    ...room.worlds.dangerous.chests,
  ]) {
    const saved = persistence.chests[chest.id];
    if (saved) {
      chest.opened = saved.opened;
      chest.used = saved.used;
    }
  }

  // 8. Restore safe state
  if (persistence.safeOpened) {
    for (const safe of [
      ...room.worlds.neutral.safes,
      ...room.worlds.dangerous.safes,
    ]) {
      safe.opened = true;
    }
  }

  // 9. Restore statue state
  for (const statue of [
    ...room.worlds.neutral.statues,
    ...room.worlds.dangerous.statues,
  ]) {
    statue.hasRedGem = persistence.statue.hasRedGem;
    statue.hasBlueGem = persistence.statue.hasBlueGem;
    statue.hasGreenGem = persistence.statue.hasGreenGem;
    statue.blackKeySpawned = persistence.statue.blackKeySpawned;
    statue.popUpText = formatStatuePopUpText(statue);
  }
}
