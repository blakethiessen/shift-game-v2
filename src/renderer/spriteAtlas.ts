// src/renderer/spriteAtlas.ts
// Complete mapping of images/spritesheet.png (1949x1525, 77 columns of 25x25 tiles),
// world objects, items (neutral N_* vs dangerous D_* +7 col offset), animated sprites
// (Player 8-way walk/idle/death + 4 health states, 5-tile weapon swings, Blobby,
// EvilLamp, Fire, DimensionTear 5-stage animations), and UI banners.

import {
  TILE_SIZE_PX,
  Direction,
  EvilLampEntity,
  HealthState,
  ItemType,
  LampEntity,
  PlayerId,
  WeaponType,
  WorldType,
} from '../shared/types';

export const SPRITESHEET_WIDTH = 1949;
export const SPRITESHEET_HEIGHT = 1525;
export const SPRITESHEET_COLS = 77;
export const EVIL_WORLD_COL_OFFSET = 7;
export const P2_WALK_COL_OFFSET = -13;
export const ACTION_BASE_COL = 54;
export const P2_ACTION_COL_OFFSET = 0;
export const P2_ACTION_ROW_OFFSET = 21;

export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BlobbyAnimFrames {
  frames: SpriteRect[];
  flipX: boolean;
}

export type TearAnimationFamily =
  | 'orthoSpread'
  | 'diagonalSpread'
  | 'spawnHorizontal'
  | 'spawnVertical'
  | 'idle';

export interface TearAnimSpec {
  frames: SpriteRect[];
  rotationDeg: 0 | 90 | 180 | 270;
  family: TearAnimationFamily;
}

export type WeaponSwingTileKey =
  | 'playerTile'
  | 'leftTile'
  | 'rightTile'
  | 'upTile'
  | 'downTile';

export type WeaponSwingFrames = Record<WeaponSwingTileKey, SpriteRect[]>;

export function tileToSourceRect(
  col: number,
  row: number,
  w: number = TILE_SIZE_PX,
  h: number = TILE_SIZE_PX
): SpriteRect {
  return {
    x: col * TILE_SIZE_PX,
    y: row * TILE_SIZE_PX,
    w,
    h,
  };
}

/**
 * Maps a 1-based Tiled GID to its source rectangle on images/spritesheet.png (77 columns).
 */
export function getGidSourceRect(gid: number): SpriteRect {
  if (gid <= 0) {
    return tileToSourceRect(4, 1);
  }
  const index = gid - 1;
  return {
    x: (index % SPRITESHEET_COLS) * TILE_SIZE_PX,
    y: Math.floor(index / SPRITESHEET_COLS) * TILE_SIZE_PX,
    w: TILE_SIZE_PX,
    h: TILE_SIZE_PX,
  };
}

export const getTileSourceRect = getGidSourceRect;

export const SPECIAL_SPRITES: {
  S_ItemGlow: SpriteRect;
  S_Empty: SpriteRect;
  ACTION_EMPTY: SpriteRect;
} = {
  S_ItemGlow: tileToSourceRect(10, 51),
  S_Empty: tileToSourceRect(4, 1),
  ACTION_EMPTY: tileToSourceRect(5, 1),
};

export const BANNER_SPRITES: {
  I_gameOver: SpriteRect;
  I_theEnd: SpriteRect;
  I_mainLogo: SpriteRect;
  I_soundSlider: SpriteRect;
  I_backButton: SpriteRect;
} = {
  I_gameOver: { x: 350, y: 0, w: 1000, h: 650 },
  // Fixed from legacy [1000, 0, 1000, 650] bug!
  I_theEnd: { x: 350, y: 650, w: 1000, h: 650 },
  I_mainLogo: { x: 1350, y: 1050, w: 500, h: 137 },
  I_soundSlider: { x: 0, y: 1475, w: 227, h: 24 },
  I_backButton: { x: 1375, y: 1200, w: 70, h: 19 },
};

export type WorldObjectSpriteKind =
  | 'pressurePlateOff'
  | 'pressurePlateOn'
  | 'leverOff'
  | 'leverOn'
  | 'chestClosed'
  | 'chestOpen'
  | 'tallLampOn'
  | 'tallLampOff'
  | 'shortLampOn'
  | 'shortLampOff'
  | 'fire'
  | 'blobby'
  | 'evilLampHead';

const NEUTRAL_WORLD_OBJECT_TILES: Record<WorldObjectSpriteKind, [number, number]> = {
  pressurePlateOff: [0, 1],
  pressurePlateOn: [1, 1],
  leverOff: [0, 2],
  leverOn: [1, 2],
  chestClosed: [0, 3],
  chestOpen: [1, 3],
  tallLampOn: [0, 4],
  tallLampOff: [1, 4],
  shortLampOn: [0, 6],
  shortLampOff: [1, 6],
  fire: [3, 24],
  blobby: [5, 44],
  evilLampHead: [6, 44],
};

export function getWorldObjectSpriteRect(
  kind: WorldObjectSpriteKind,
  world: WorldType
): SpriteRect {
  const [baseCol, row] = NEUTRAL_WORLD_OBJECT_TILES[kind];
  const colOffset = world === 'dangerous' ? EVIL_WORLD_COL_OFFSET : 0;
  return tileToSourceRect(baseCol + colOffset, row);
}

/**
 * Resolves the active/inactive sprite rect for a LampEntity, preserving tall vs short lamp variants.
 */
export function getLampSpriteRect(lamp: LampEntity): SpriteRect {
  const gidRow = lamp.gid > 0 ? Math.floor((lamp.gid - 1) / SPRITESHEET_COLS) : 4;
  const isShort = gidRow === 6;
  if (isShort) {
    return getWorldObjectSpriteRect(
      lamp.isOn && !lamp.isBroken ? 'shortLampOn' : 'shortLampOff',
      lamp.world
    );
  }
  return getWorldObjectSpriteRect(
    lamp.isOn && !lamp.isBroken ? 'tallLampOn' : 'tallLampOff',
    lamp.world
  );
}

const NEUTRAL_ITEM_TILES: Record<ItemType, [number, number]> = {
  Flashlight: [1, 44],
  Flashlight2: [2, 44],
  Lantern: [3, 44],
  BlackKey: [1, 45],
  Key: [2, 45],
  GreenGem: [1, 46],
  BlueGem: [2, 46],
  RedGem: [3, 46],
  Chips: [1, 47],
  Plunger: [3, 47],
  Broom: [4, 47],
  WaterBottle: [1, 48],
  Sandwich: [2, 48],
  FryingPan: [3, 48],
  Lollipop: [1, 49],
};

export function getItemSpriteRect(
  itemType: ItemType,
  world: WorldType,
  lollipopColor: 'green' | 'red' | 'blue' = 'green'
): SpriteRect {
  const colOffset = world === 'dangerous' ? EVIL_WORLD_COL_OFFSET : 0;
  if (itemType === 'Lollipop') {
    if (lollipopColor === 'red') {
      return tileToSourceRect(2 + colOffset, 49);
    }
    if (lollipopColor === 'blue') {
      return tileToSourceRect(1 + colOffset, 50);
    }
    return tileToSourceRect(1 + colOffset, 49);
  }
  const [baseCol, row] = NEUTRAL_ITEM_TILES[itemType];
  return tileToSourceRect(baseCol + colOffset, row);
}

// ============================================================================
// Player Walk, Idle, Death, and 5-Tile Weapon Swing Animations
// ============================================================================

export const HEALTH_WALK_ROW_OFFSETS: Record<HealthState, number> = {
  Normal: 0,
  Bruised: 1,
  Injured: 2,
  Dying: 3,
};

export const HEALTH_ACTION_COL_OFFSETS: Record<HealthState, number> = {
  Normal: 0,
  Bruised: 6,
  Injured: 12,
  Dying: 18,
};

export const WEAPON_ROW_OFFSETS: Record<WeaponType, number> = {
  Broom: 1,
  Plunger: 8,
  FryingPan: 15,
};

interface RawRangeAnim {
  xFrom: number;
  xTo: number;
  y: number;
  /** Up, UpLeft, UpRight only have 1 back-of-head row on the 1525px spritesheet */
  supportsHealthRows: boolean;
}

const P1_WALK_ANIMS: Record<number, RawRangeAnim> = {
  [Direction.Left]: { xFrom: 47, xTo: 50, y: 57, supportsHealthRows: true },
  [Direction.Right]: { xFrom: 51, xTo: 54, y: 52, supportsHealthRows: true },
  [Direction.Up]: { xFrom: 47, xTo: 50, y: 56, supportsHealthRows: false },
  [Direction.Down]: { xFrom: 47, xTo: 50, y: 52, supportsHealthRows: true },
  [Direction.UpLeft]: { xFrom: 51, xTo: 54, y: 60, supportsHealthRows: false },
  [Direction.UpRight]: { xFrom: 55, xTo: 58, y: 60, supportsHealthRows: false },
  [Direction.DownLeft]: { xFrom: 51, xTo: 54, y: 56, supportsHealthRows: true },
  [Direction.DownRight]: { xFrom: 55, xTo: 58, y: 56, supportsHealthRows: true },
};

export function getPlayerWalkFrames(
  playerId: PlayerId,
  direction: Direction,
  healthState: HealthState
): SpriteRect[] {
  const baseAnim = P1_WALK_ANIMS[direction] ?? P1_WALK_ANIMS[Direction.Down];
  const colOffset = playerId === 2 ? P2_WALK_COL_OFFSET : 0;
  const rowOffset = baseAnim.supportsHealthRows
    ? HEALTH_WALK_ROW_OFFSETS[healthState]
    : 0;
  const row = baseAnim.y + rowOffset;

  const frames: SpriteRect[] = [];
  for (let col = baseAnim.xFrom; col <= baseAnim.xTo; col++) {
    frames.push(tileToSourceRect(col + colOffset, row));
  }
  return frames;
}

export function getPlayerIdleSpriteRect(
  playerId: PlayerId,
  direction: Direction,
  healthState: HealthState
): SpriteRect {
  const walkFrames = getPlayerWalkFrames(playerId, direction, healthState);
  // In sprites.js, N_playerDown is [48, 52], which is frame index 1 of the 47..50 walk cycle
  return walkFrames[1] ?? walkFrames[0];
}

export function getPlayerDeathFrames(
  playerId: PlayerId,
  direction: Direction
): SpriteRect[] {
  const colOffset = playerId === 2 ? P2_WALK_COL_OFFSET : 0;
  let row = 52; // DeathDown default
  if (direction === Direction.Up || direction === Direction.UpRight) {
    row = 53; // DeathUp
  } else if (direction === Direction.Right || direction === Direction.DownRight) {
    row = 54; // DeathRight
  } else if (direction === Direction.Left || direction === Direction.UpLeft) {
    row = 55; // DeathLeft
  }

  const frames: SpriteRect[] = [];
  for (let col = 55; col <= 58; col++) {
    frames.push(tileToSourceRect(col + colOffset, row));
  }
  return frames;
}

type CardinalActionKey = 'left' | 'right' | 'up' | 'down';

const EMPTY_COORD: [number, number] = [5, 1];

const BASE_ACTION_FRAMES: Record<
  WeaponSwingTileKey,
  Record<CardinalActionKey, Array<[number, number]>>
> = {
  playerTile: {
    left: [
      [0, 0],
      [2, 0],
      [4, 0],
      [11, 12],
    ],
    right: [
      [0, 2],
      [1, 2],
      [3, 2],
      [13, 12],
    ],
    up: [
      [3, 4],
      [5, 4],
      [15, 12],
    ],
    down: [
      [1, 4],
      [2, 4],
      [7, 12],
    ],
  },
  leftTile: {
    left: [EMPTY_COORD, [1, 0], [3, 0], EMPTY_COORD],
    right: [EMPTY_COORD, EMPTY_COORD, EMPTY_COORD, EMPTY_COORD],
    up: [EMPTY_COORD, EMPTY_COORD, EMPTY_COORD],
    down: [[0, 4], EMPTY_COORD, EMPTY_COORD],
  },
  rightTile: {
    left: [EMPTY_COORD, EMPTY_COORD, EMPTY_COORD, EMPTY_COORD],
    right: [EMPTY_COORD, [2, 2], [4, 2], EMPTY_COORD],
    up: [[4, 4], EMPTY_COORD, EMPTY_COORD],
    down: [EMPTY_COORD, EMPTY_COORD, EMPTY_COORD],
  },
  upTile: {
    left: [
      [0, -1],
      EMPTY_COORD,
      EMPTY_COORD,
      EMPTY_COORD,
    ],
    right: [
      [0, 1],
      EMPTY_COORD,
      EMPTY_COORD,
      EMPTY_COORD,
    ],
    up: [
      [3, 3],
      EMPTY_COORD,
      EMPTY_COORD,
    ],
    down: [
      [1, 3],
      EMPTY_COORD,
      EMPTY_COORD,
    ],
  },
  downTile: {
    left: [EMPTY_COORD, EMPTY_COORD, EMPTY_COORD, EMPTY_COORD],
    right: [EMPTY_COORD, EMPTY_COORD, EMPTY_COORD, EMPTY_COORD],
    up: [EMPTY_COORD, EMPTY_COORD, EMPTY_COORD],
    down: [EMPTY_COORD, [2, 5], EMPTY_COORD],
  },
};

function directionToCardinalActionKey(direction: Direction): CardinalActionKey {
  switch (direction) {
    case Direction.Left:
    case Direction.UpLeft:
      return 'left';
    case Direction.Right:
    case Direction.DownRight:
      return 'right';
    case Direction.Up:
    case Direction.UpRight:
      return 'up';
    case Direction.Down:
    case Direction.DownLeft:
    default:
      return 'down';
  }
}

const CARDINAL_ACTION_DIRECTIONS: Record<CardinalActionKey, Direction> = {
  left: Direction.Left,
  right: Direction.Right,
  up: Direction.Up,
  down: Direction.Down,
};

export function getWeaponSwingFrames(
  playerId: PlayerId,
  weapon: WeaponType,
  direction: Direction,
  healthState: HealthState
): WeaponSwingFrames {
  const dirKey = directionToCardinalActionKey(direction);
  const cardinalDirection = CARDINAL_ACTION_DIRECTIONS[dirKey];
  const weaponRowOffset = WEAPON_ROW_OFFSETS[weapon];
  const stateColOffset = HEALTH_ACTION_COL_OFFSETS[healthState];
  const playerColOffset = playerId === 2 ? P2_ACTION_COL_OFFSET : 0;
  const playerRowOffset = playerId === 2 ? P2_ACTION_ROW_OFFSET : 0;

  const result = {} as WeaponSwingFrames;
  const tileKeys: WeaponSwingTileKey[] = [
    'playerTile',
    'leftTile',
    'rightTile',
    'upTile',
    'downTile',
  ];

  for (const tileKey of tileKeys) {
    const rawFrames = BASE_ACTION_FRAMES[tileKey][dirKey];
    const mapped: SpriteRect[] = rawFrames.map(([baseCol, baseRow], idx) => {
      const isLastFrame = idx === rawFrames.length - 1;

      if (tileKey === 'playerTile' && isLastFrame) {
        return getPlayerIdleSpriteRect(playerId, cardinalDirection, healthState);
      }

      const isEmptyTile =
        (baseCol === EMPTY_COORD[0] && baseRow === EMPTY_COORD[1]) ||
        (weapon === 'FryingPan' &&
          tileKey === 'upTile' &&
          (dirKey === 'up' || dirKey === 'down'));
      if (isEmptyTile || isLastFrame) {
        return SPECIAL_SPRITES.ACTION_EMPTY;
      }

      const col =
        ACTION_BASE_COL + baseCol + stateColOffset + playerColOffset;
      const row = baseRow + weaponRowOffset + playerRowOffset;
      return tileToSourceRect(col, row);
    });
    result[tileKey] = mapped;
  }

  return result;
}

// ============================================================================
// Blobby, EvilLamp, Fire, and DimensionTear Animations
// ============================================================================

export function getBlobbyAnimFrames(direction: Direction): BlobbyAnimFrames {
  let row = 52;
  let colTo = 64;
  let flipX = false;

  switch (direction) {
    case Direction.Left:
      row = 53;
      colTo = 63;
      flipX = true;
      break;
    case Direction.Right:
      row = 53;
      colTo = 63;
      flipX = false;
      break;
    case Direction.Up:
      row = 55;
      colTo = 64;
      flipX = false;
      break;
    case Direction.Down:
      row = 52;
      colTo = 64;
      flipX = false;
      break;
    case Direction.UpLeft:
      row = 54;
      colTo = 63;
      flipX = true;
      break;
    case Direction.UpRight:
      row = 54;
      colTo = 63;
      flipX = false;
      break;
    case Direction.DownLeft:
      row = 56;
      colTo = 63;
      flipX = false;
      break;
    case Direction.DownRight:
      row = 56;
      colTo = 63;
      flipX = true;
      break;
    default:
      row = 52;
      colTo = 64;
      flipX = false;
      break;
  }

  const frames: SpriteRect[] = [];
  for (let col = 60; col <= colTo; col++) {
    frames.push(tileToSourceRect(col, row));
  }

  return { frames, flipX };
}

/**
 * EvilLamp animations:
 * - Neutral orange: cols 60..65, row 50
 * - Dangerous green: cols 66..71, row 50
 */
export function getEvilLampFrames(
  world: WorldType,
  mode: 'opening' | 'closing' = 'opening'
): SpriteRect[] {
  const startCol = world === 'dangerous' ? 66 : 60;
  const endCol = world === 'dangerous' ? 71 : 65;
  const frames: SpriteRect[] = [];
  if (mode === 'opening') {
    for (let col = startCol; col <= endCol; col++) {
      frames.push(tileToSourceRect(col, 50));
    }
  } else {
    for (let col = endCol; col >= startCol; col--) {
      frames.push(tileToSourceRect(col, 50));
    }
  }
  return frames;
}

export function getEvilLampSpriteRect(
  evilLamp: EvilLampEntity,
  timeMs: number = 0
): SpriteRect {
  const openFrames = getEvilLampFrames(evilLamp.world, 'opening');
  if (!evilLamp.isOn || evilLamp.stage === 'dormant') {
    return openFrames[0];
  }
  if (evilLamp.stage === 'attacking') {
    return openFrames[openFrames.length - 1];
  }
  if (evilLamp.stage === 'opening') {
    const progress = Math.min(1, Math.max(0, 1 - evilLamp.timerMs / 600));
    const idx = Math.min(
      openFrames.length - 1,
      Math.floor(progress * openFrames.length)
    );
    return openFrames[idx];
  }
  // cooldown stage: closing mouth
  const closeFrames = getEvilLampFrames(evilLamp.world, 'closing');
  const progress = Math.min(
    1,
    Math.max(0, 1 - (evilLamp.timerMs || timeMs % 1000) / 1000)
  );
  const idx = Math.min(
    closeFrames.length - 1,
    Math.floor(progress * closeFrames.length)
  );
  return closeFrames[idx];
}

/**
 * Fire animations:
 * - Active red/orange (isOn === true): cols 60..62, row 57
 * - Off/pilot blue soul-flame (isOn === false): cols 65..69, row 57
 */
export function getFireAnimFrames(isOn: boolean): SpriteRect[] {
  const startCol = isOn ? 60 : 65;
  const endCol = isOn ? 62 : 69;
  const frames: SpriteRect[] = [];
  for (let col = startCol; col <= endCol; col++) {
    frames.push(tileToSourceRect(col, 57));
  }
  return frames;
}

function buildPingPongTearFrames(
  xFrom: number,
  xTo: number,
  y: number
): SpriteRect[] {
  const length = Math.max(1, xTo - xFrom);
  const frames: SpriteRect[] = [];
  for (let i = 0; i < length; i++) {
    frames.push(tileToSourceRect(xFrom + i, y));
  }
  for (let i = length - 1; i > 0; i--) {
    frames.push(tileToSourceRect(xFrom + i, y));
  }
  return frames;
}

const TEAR_ORTHO_STAGES: Array<[number, number, number]> = [
  [0, 5, 54],
  [3, 8, 54],
  [6, 11, 54],
  [9, 14, 54],
  [12, 17, 54],
];

const TEAR_SPAWN_VERTICAL_STAGES: Array<[number, number, number]> = [
  [0, 5, 56],
  [4, 9, 56],
  [8, 13, 56],
  [12, 17, 56],
  [16, 22, 56],
];

const TEAR_DIAGONAL_STAGES: Array<[number, number, number]> = [
  [0, 5, 57],
  [6, 10, 57],
  [1, 15, 57],
  [16, 20, 57],
  [21, 26, 57],
];

const TEAR_SPAWN_HORIZONTAL_STAGES: Array<[number, number, number]> = [
  [19, 25, 53],
  [24, 30, 53],
  [29, 35, 53],
  [34, 40, 53],
  [39, 42, 53],
];

export function getDimensionTearAnim(
  angle: Direction,
  stage: number
): TearAnimSpec {
  const clampedStage = Math.max(0, Math.min(4, Math.floor(stage)));
  let stageTable = TEAR_SPAWN_VERTICAL_STAGES;
  let rotationDeg: 0 | 90 | 180 | 270 = 0;
  let family: TearAnimationFamily = 'spawnVertical';

  switch (angle) {
    case Direction.Up:
      stageTable = TEAR_ORTHO_STAGES;
      rotationDeg = 0;
      family = 'orthoSpread';
      break;
    case Direction.Right:
      stageTable = TEAR_ORTHO_STAGES;
      rotationDeg = 90;
      family = 'orthoSpread';
      break;
    case Direction.Down:
      stageTable = TEAR_ORTHO_STAGES;
      rotationDeg = 180;
      family = 'orthoSpread';
      break;
    case Direction.Left:
      stageTable = TEAR_ORTHO_STAGES;
      rotationDeg = 270;
      family = 'orthoSpread';
      break;
    case Direction.UpRight:
      stageTable = TEAR_DIAGONAL_STAGES;
      rotationDeg = 0;
      family = 'diagonalSpread';
      break;
    case Direction.DownRight:
      stageTable = TEAR_DIAGONAL_STAGES;
      rotationDeg = 90;
      family = 'diagonalSpread';
      break;
    case Direction.DownLeft:
      stageTable = TEAR_DIAGONAL_STAGES;
      rotationDeg = 180;
      family = 'diagonalSpread';
      break;
    case Direction.UpLeft:
      stageTable = TEAR_DIAGONAL_STAGES;
      rotationDeg = 270;
      family = 'diagonalSpread';
      break;
    case Direction.Horizontal:
      stageTable = TEAR_SPAWN_HORIZONTAL_STAGES;
      rotationDeg = 0;
      family = 'spawnHorizontal';
      break;
    case Direction.Vertical:
    case Direction.None:
    default:
      stageTable = TEAR_SPAWN_VERTICAL_STAGES;
      rotationDeg = 0;
      family = 'spawnVertical';
      break;
  }

  const [xFrom, xTo, y] = stageTable[clampedStage];
  return {
    frames: buildPingPongTearFrames(xFrom, xTo, y),
    rotationDeg,
    family,
  };
}
