// src/core/playerLogic.ts
// Pure TypeScript player movement, collision ([3,3]..[22,22] hitbox), linked box pushing,
// 4 health states, passive speed regeneration, A* damage push, and inventory/item actions.

import {
  BoxEntity,
  DIM_HEIGHT_PX,
  DIM_HEIGHT_TILES,
  DIM_WIDTH_PX,
  DIM_WIDTH_TILES,
  Direction,
  DoorEntity,
  FlashlightMode,
  GameEvent,
  GameState,
  getWorldForSide,
  HealthState,
  ItemData,
  ItemEntity,
  localPixelToTile,
  MAX_PLAYER_SPEED,
  MIN_PLAYER_SPEED,
  PlayerId,
  PlayerInput,
  PlayerState,
  TILE_SIZE_PX,
  TileCoord,
  tileManhattanDistance,
  WeaponType,
  WorldGridState,
  WorldType,
} from '../shared/types';
import {
  formatStatuePopUpText,
  getDefaultItemGid,
  getDefaultItemPopUpText,
} from './levelParser';
import { findPath, isTileBlocked, isTileInBounds } from './pathfinding';
import { knockbackBlobby, shrinkTear } from './monstersAndTears';
import { toggleLamp, toggleLever } from './worldObjectsLogic';

const PLAYER_HITBOX_MIN = 3;
const PLAYER_HITBOX_MAX = 22;
const BOX_HITBOX_MIN = 1;
const BOX_HITBOX_MAX = 24;

export function emitEvent(
  state: GameState,
  event: Omit<GameEvent, 'eventId'>
): void {
  state.events.push({
    ...event,
    eventId: state.nextEventId++,
  });
}

export function getHealthStateForSpeed(speed: number): HealthState {
  if (speed > 1.6) return 'Normal';
  if (speed > 1.2) return 'Bruised';
  if (speed > 0.8) return 'Injured';
  return 'Dying';
}

function rectsOverlap(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number
): boolean {
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

export function doesPlayerCollideWithWalls(
  grid: WorldGridState,
  x: number,
  y: number
): boolean {
  const left = x + PLAYER_HITBOX_MIN;
  const right = x + PLAYER_HITBOX_MAX;
  const top = y + PLAYER_HITBOX_MIN;
  const bottom = y + PLAYER_HITBOX_MAX;

  if (left < 0 || right > DIM_WIDTH_PX || top < 0 || bottom > DIM_HEIGHT_PX) {
    return true;
  }

  const minTileX = Math.max(0, Math.floor(left / TILE_SIZE_PX));
  const maxTileX = Math.min(
    DIM_WIDTH_TILES - 1,
    Math.floor((right - 0.001) / TILE_SIZE_PX)
  );
  const minTileY = Math.max(0, Math.floor(top / TILE_SIZE_PX));
  const maxTileY = Math.min(
    DIM_HEIGHT_TILES - 1,
    Math.floor((bottom - 0.001) / TILE_SIZE_PX)
  );

  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      const cell = grid.cells[tx]?.[ty];
      if (!cell || cell.collides || cell.isHole || cell.isWallDoor) {
        return true;
      }
    }
  }

  return false;
}

function findCollidingDoor(
  grid: WorldGridState,
  x: number,
  y: number
): DoorEntity | null {
  const left = x + PLAYER_HITBOX_MIN;
  const right = x + PLAYER_HITBOX_MAX;
  const top = y + PLAYER_HITBOX_MIN;
  const bottom = y + PLAYER_HITBOX_MAX;

  for (const door of grid.doors) {
    if (
      rectsOverlap(
        left,
        top,
        right,
        bottom,
        door.x,
        door.y,
        door.x + TILE_SIZE_PX,
        door.y + TILE_SIZE_PX
      )
    ) {
      return door;
    }
  }
  return null;
}

function findOverlappingBox(
  grid: WorldGridState,
  x: number,
  y: number
): BoxEntity | null {
  const left = x + PLAYER_HITBOX_MIN;
  const right = x + PLAYER_HITBOX_MAX;
  const top = y + PLAYER_HITBOX_MIN;
  const bottom = y + PLAYER_HITBOX_MAX;

  for (const box of grid.boxes) {
    if (
      rectsOverlap(
        left,
        top,
        right,
        bottom,
        box.x + BOX_HITBOX_MIN,
        box.y + BOX_HITBOX_MIN,
        box.x + BOX_HITBOX_MAX,
        box.y + BOX_HITBOX_MAX
      )
    ) {
      return box;
    }
  }
  return null;
}

export function doesBoxCollide(
  grid: WorldGridState,
  box: BoxEntity,
  otherPlayer?: PlayerState
): boolean {
  const left = box.x + BOX_HITBOX_MIN;
  const right = box.x + BOX_HITBOX_MAX;
  const top = box.y + BOX_HITBOX_MIN;
  const bottom = box.y + BOX_HITBOX_MAX;

  if (left < 0 || right > DIM_WIDTH_PX || top < 0 || bottom > DIM_HEIGHT_PX) {
    return true;
  }

  const minTileX = Math.max(0, Math.floor(left / TILE_SIZE_PX));
  const maxTileX = Math.min(
    DIM_WIDTH_TILES - 1,
    Math.floor((right - 0.001) / TILE_SIZE_PX)
  );
  const minTileY = Math.max(0, Math.floor(top / TILE_SIZE_PX));
  const maxTileY = Math.min(
    DIM_HEIGHT_TILES - 1,
    Math.floor((bottom - 0.001) / TILE_SIZE_PX)
  );

  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      const cell = grid.cells[tx]?.[ty];
      if (!cell || cell.collides || cell.isHole || cell.isWallDoor) {
        return true;
      }
    }
  }

  for (const door of grid.doors) {
    if (
      rectsOverlap(
        left,
        top,
        right,
        bottom,
        door.x,
        door.y,
        door.x + TILE_SIZE_PX,
        door.y + TILE_SIZE_PX
      )
    ) {
      return true;
    }
  }

  for (const otherBox of grid.boxes) {
    if (otherBox.id === box.id) continue;
    if (
      rectsOverlap(
        left,
        top,
        right,
        bottom,
        otherBox.x + BOX_HITBOX_MIN,
        otherBox.y + BOX_HITBOX_MIN,
        otherBox.x + BOX_HITBOX_MAX,
        otherBox.y + BOX_HITBOX_MAX
      )
    ) {
      return true;
    }
  }

  if (otherPlayer) {
    if (
      rectsOverlap(
        left,
        top,
        right,
        bottom,
        otherPlayer.x + PLAYER_HITBOX_MIN,
        otherPlayer.y + PLAYER_HITBOX_MIN,
        otherPlayer.x + PLAYER_HITBOX_MAX,
        otherPlayer.y + PLAYER_HITBOX_MAX
      )
    ) {
      return true;
    }
  }

  return false;
}

export function nextToAndFace(
  player: PlayerState,
  targetX: number,
  targetY: number
): Direction {
  const playerCoord = localPixelToTile(player.x, player.y);
  const objCoord = localPixelToTile(targetX, targetY);

  if (playerCoord.x === objCoord.x && playerCoord.y === objCoord.y) {
    return player.direction || Direction.Down;
  }

  const dx = objCoord.x - playerCoord.x;
  const dy = objCoord.y - playerCoord.y;

  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    return Direction.None;
  }

  switch (player.direction) {
    case Direction.Left:
      if (dx === -1 && Math.abs(dy) <= 1) return Direction.Left;
      break;
    case Direction.Right:
      if (dx === 1 && Math.abs(dy) <= 1) return Direction.Right;
      break;
    case Direction.Up:
      if (dy === -1 && Math.abs(dx) <= 1) return Direction.Up;
      break;
    case Direction.Down:
      if (dy === 1 && Math.abs(dx) <= 1) return Direction.Down;
      break;
    case Direction.UpLeft:
      if (dx <= 0 && dy <= 0) return dx === -1 ? Direction.Left : Direction.Up;
      break;
    case Direction.UpRight:
      if (dx >= 0 && dy <= 0) return dx === 1 ? Direction.Right : Direction.Up;
      break;
    case Direction.DownLeft:
      if (dx <= 0 && dy >= 0)
        return dx === -1 ? Direction.Left : Direction.Down;
      break;
    case Direction.DownRight:
      if (dx >= 0 && dy >= 0)
        return dx === 1 ? Direction.Right : Direction.Down;
      break;
  }

  return Direction.None;
}

export function isWithinTileRange(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rangeTiles: number
): boolean {
  const distX = Math.abs(ax - bx) / TILE_SIZE_PX;
  const distY = Math.abs(ay - by) / TILE_SIZE_PX;
  const euclidean = Math.hypot(distX, distY);
  const aTile = localPixelToTile(ax, ay);
  const bTile = localPixelToTile(bx, by);
  const chebyshev = Math.max(
    Math.abs(aTile.x - bTile.x),
    Math.abs(aTile.y - bTile.y)
  );
  return euclidean <= rangeTiles || chebyshev <= rangeTiles;
}

function pushPlayerAlongPath(
  state: GameState,
  pushedPlayer: PlayerState,
  targetPlayer: PlayerState
): boolean {
  const world = getWorldForSide(pushedPlayer.side, state.evilOnLeft);
  const grid = state.room.worlds[world];
  const startCoord = localPixelToTile(pushedPlayer.x, pushedPlayer.y);
  const targetCoord = localPixelToTile(targetPlayer.x, targetPlayer.y);

  const path = findPath(grid, startCoord, targetCoord);
  if (path.length === 0) {
    return false;
  }

  const distancePushed = Math.max(
    1,
    Math.floor((path.length - 1) / (pushedPlayer.speed * 3))
  );
  const idx = Math.min(path.length - 1, distancePushed);
  pushedPlayer.x = path[idx].x * TILE_SIZE_PX;
  pushedPlayer.y = path[idx].y * TILE_SIZE_PX;
  return true;
}

export function takeDamage(
  state: GameState,
  playerId: PlayerId,
  factor: number
): void {
  const player = state.players[playerId - 1];
  const otherPlayer = state.players[playerId === 1 ? 1 : 0];
  if (!player.isAlive || state.phase !== 'playing') {
    return;
  }

  const world = getWorldForSide(player.side, state.evilOnLeft);
  player.speed = Math.max(0.1, player.speed * factor);
  player.healthState = getHealthStateForSpeed(player.speed);

  const p1Tile = localPixelToTile(state.players[0].x, state.players[0].y);
  const p2Tile = localPixelToTile(state.players[1].x, state.players[1].y);

  if (p1Tile.x === p2Tile.x && p1Tile.y === p2Tile.y) {
    state.players[0].isAlive = false;
    state.players[1].isAlive = false;
    state.players[0].velocity = { x: 0, y: 0 };
    state.players[1].velocity = { x: 0, y: 0 };
    state.players[0].isMoving = false;
    state.players[1].isMoving = false;
    state.players[0].activePopupText = null;
    state.players[1].activePopupText = null;
    state.phase = 'dying';
    state.phaseTimerMs = 3000;

    emitEvent(state, {
      type: 'playSound',
      sound: 'death',
      playerId,
      side: player.side,
      world,
    });
    emitEvent(state, {
      type: 'flashScreen',
      color: 'red',
      durationMs: 300,
      maxOpacity: 1.0,
      playerId,
      side: player.side,
      world,
    });
    emitEvent(state, {
      type: 'playerDamaged',
      playerId,
      side: player.side,
      world,
    });
  } else {
    emitEvent(state, {
      type: 'playSound',
      sound: 'damage',
      playerId,
      side: player.side,
      world,
    });
    emitEvent(state, {
      type: 'flashScreen',
      color: 'red',
      durationMs: 250,
      maxOpacity: 0.8,
      playerId,
      side: player.side,
      world,
    });
    emitEvent(state, {
      type: 'playerDamaged',
      playerId,
      side: player.side,
      world,
    });

    const pushed = pushPlayerAlongPath(state, player, otherPlayer);
    if (!pushed) {
      pushPlayerAlongPath(state, otherPlayer, player);
    }
  }

  const newP1Tile = localPixelToTile(state.players[0].x, state.players[0].y);
  const newP2Tile = localPixelToTile(state.players[1].x, state.players[1].y);
  state.convergenceDistance = tileManhattanDistance(newP1Tile, newP2Tile);
}

function computeDirectionFromInput(
  input: PlayerInput,
  currentDir: Direction
): { direction: Direction; isMoving: boolean } {
  const { up, down, left, right } = input;
  const isMoving = up || down || left || right;
  if (!isMoving) {
    return { direction: currentDir, isMoving: false };
  }

  if (left) {
    if (up) return { direction: Direction.UpLeft, isMoving: true };
    if (down) return { direction: Direction.DownLeft, isMoving: true };
    if (!right) return { direction: Direction.Left, isMoving: true };
  } else if (right) {
    if (up) return { direction: Direction.UpRight, isMoving: true };
    if (down) return { direction: Direction.DownRight, isMoving: true };
    return { direction: Direction.Right, isMoving: true };
  } else if (up && !down) {
    return { direction: Direction.Up, isMoving: true };
  } else if (down) {
    return { direction: Direction.Down, isMoving: true };
  }

  return { direction: currentDir, isMoving: false };
}

function computeVelocityForDirection(
  direction: Direction,
  speed: number,
  boxColliding: boolean
): { x: number; y: number } {
  const adjustedSpeed = boxColliding ? (speed * 3) / 4 : speed;
  const adjustedDiagSpeed = adjustedSpeed / 1.4;

  switch (direction) {
    case Direction.Left:
      return { x: -adjustedSpeed, y: 0 };
    case Direction.Right:
      return { x: adjustedSpeed, y: 0 };
    case Direction.Up:
      return { x: 0, y: -adjustedSpeed };
    case Direction.Down:
      return { x: 0, y: adjustedSpeed };
    case Direction.DownLeft:
      return { x: -adjustedDiagSpeed, y: adjustedDiagSpeed };
    case Direction.DownRight:
      return { x: adjustedDiagSpeed, y: adjustedDiagSpeed };
    case Direction.UpLeft:
      return { x: -adjustedDiagSpeed, y: -adjustedDiagSpeed };
    case Direction.UpRight:
      return { x: adjustedDiagSpeed, y: -adjustedDiagSpeed };
    default:
      return { x: 0, y: 0 };
  }
}

function getFrontTileCoords(player: PlayerState): TileCoord[] {
  const base = localPixelToTile(player.x, player.y);
  const candidates: Array<[number, number]> = [];

  switch (player.direction) {
    case Direction.Up:
      candidates.push([0, -1]);
      break;
    case Direction.Down:
      candidates.push([0, 1]);
      break;
    case Direction.Left:
      candidates.push([-1, 0]);
      break;
    case Direction.Right:
      candidates.push([1, 0]);
      break;
    case Direction.UpLeft:
      candidates.push([-1, -1], [-1, 0], [0, -1]);
      break;
    case Direction.UpRight:
      candidates.push([1, -1], [1, 0], [0, -1]);
      break;
    case Direction.DownLeft:
      candidates.push([-1, 1], [-1, 0], [0, 1]);
      break;
    case Direction.DownRight:
      candidates.push([1, 1], [1, 0], [0, 1]);
      break;
    default:
      candidates.push([0, 1]);
      break;
  }

  const valid: TileCoord[] = [];
  for (const [dx, dy] of candidates) {
    const tx = base.x + dx;
    const ty = base.y + dy;
    if (isTileInBounds(tx, ty)) {
      valid.push({ x: tx, y: ty });
    }
  }
  valid.push(base);
  return valid;
}

function updatePlayerInteractableHover(
  player: PlayerState,
  grid: WorldGridState
): void {
  const px = player.x + PLAYER_HITBOX_MIN;
  const py = player.y + PLAYER_HITBOX_MIN;
  const pr = player.x + PLAYER_HITBOX_MAX;
  const pb = player.y + PLAYER_HITBOX_MAX;

  // 1. Overlapping item on the floor
  for (const item of grid.items) {
    if (
      rectsOverlap(
        px,
        py,
        pr,
        pb,
        item.x,
        item.y,
        item.x + TILE_SIZE_PX,
        item.y + TILE_SIZE_PX
      )
    ) {
      player.interactingObjectId = item.id;
      player.activePopupText = item.item.popUpText;
      player.popupFaceDirection = player.direction;
      return;
    }
  }

  // 2. Adjacent & facing interactable world objects
  const candidates: Array<{
    id: string;
    x: number;
    y: number;
    popUpText: string;
  }> = [
    ...grid.doors,
    ...grid.lamps,
    ...grid.evilLamps,
    ...grid.pressurePlates,
    ...grid.levers,
    ...grid.chests,
    ...grid.safes,
    ...grid.statues,
    ...grid.books,
  ];

  for (const obj of candidates) {
    const faceDir = nextToAndFace(player, obj.x, obj.y);
    if (faceDir !== Direction.None) {
      player.interactingObjectId = obj.id;
      player.activePopupText = obj.popUpText;
      player.popupFaceDirection = faceDir;
      return;
    }
  }

  player.interactingObjectId = null;
  player.activePopupText = null;
}

function handlePlayerInteract(
  state: GameState,
  player: PlayerState,
  world: WorldType,
  grid: WorldGridState
): void {
  const px = player.x + PLAYER_HITBOX_MIN;
  const py = player.y + PLAYER_HITBOX_MIN;
  const pr = player.x + PLAYER_HITBOX_MAX;
  const pb = player.y + PLAYER_HITBOX_MAX;

  // 1. Check item pickup (overlapping or adjacent & facing)
  const itemIdx = grid.items.findIndex(
    (item) =>
      rectsOverlap(
        px,
        py,
        pr,
        pb,
        item.x,
        item.y,
        item.x + TILE_SIZE_PX,
        item.y + TILE_SIZE_PX
      ) || nextToAndFace(player, item.x, item.y) !== Direction.None
  );

  if (itemIdx !== -1) {
    const [picked] = grid.items.splice(itemIdx, 1);
    player.inventory.push(picked.item);

    const persist = state.persistence[state.roomName];
    if (persist) {
      const addedIdx = persist.addedItems.findIndex(
        (a) =>
          a.id === picked.id ||
          (a.world === world &&
            a.x === picked.x &&
            a.y === picked.y &&
            a.item.type === picked.item.type)
      );
      if (addedIdx !== -1) {
        persist.addedItems.splice(addedIdx, 1);
      } else {
        persist.removedItemCoords.push({
          world,
          x: picked.x,
          y: picked.y,
          type: picked.item.type,
        });
      }
    }

    emitEvent(state, {
      type: 'playSound',
      sound: 'itemPickup',
      playerId: player.id,
      side: player.side,
      world,
    });
    return;
  }

  // 2. Check Lamp / EvilLamp toggle
  for (const lamp of grid.lamps) {
    if (
      !lamp.isBroken &&
      nextToAndFace(player, lamp.x, lamp.y) !== Direction.None
    ) {
      toggleLamp(state, lamp);
      return;
    }
  }
  for (const evilLamp of grid.evilLamps) {
    if (nextToAndFace(player, evilLamp.x, evilLamp.y) !== Direction.None) {
      toggleLamp(state, evilLamp);
      return;
    }
  }

  // 3. Check Lever toggle
  for (const lever of grid.levers) {
    if (nextToAndFace(player, lever.x, lever.y) !== Direction.None) {
      toggleLever(state, lever, player);
      return;
    }
  }
}

function handleInventoryCycle(
  state: GameState,
  player: PlayerState,
  world: WorldType
): void {
  if (player.inventory.length === 0) return;
  player.currentItemIndex =
    (player.currentItemIndex + 1) % player.inventory.length;
  player.inventoryDisplayTimerMs = 1500;
  emitEvent(state, {
    type: 'playSound',
    sound: 'inventory',
    playerId: player.id,
    side: player.side,
    world,
  });
}

function syncFlashlightAfterInventoryRemoval(
  player: PlayerState,
  removedItem: ItemData
): void {
  const modeMap: Partial<Record<ItemData['type'], FlashlightMode>> = {
    Flashlight: 'flashlight1',
    Flashlight2: 'flashlight2',
    Lantern: 'lantern',
  };
  const mode = modeMap[removedItem.type];
  if (
    mode &&
    player.flashlightMode === mode &&
    !player.inventory.some((i) => i.type === removedItem.type)
  ) {
    player.flashlightMode = 'none';
  }
}

function consumeCurrentInventoryItem(player: PlayerState): ItemData | null {
  if (player.inventory.length === 0) return null;
  const idx = Math.min(player.currentItemIndex, player.inventory.length - 1);
  const [removed] = player.inventory.splice(idx, 1);
  player.currentItemIndex =
    player.inventory.length === 0
      ? 0
      : player.currentItemIndex % player.inventory.length;
  syncFlashlightAfterInventoryRemoval(player, removed);
  return removed;
}

function handleInventoryDrop(
  state: GameState,
  player: PlayerState,
  world: WorldType,
  grid: WorldGridState
): void {
  if (player.inventory.length === 0) {
    emitEvent(state, {
      type: 'playSound',
      sound: 'error',
      playerId: player.id,
      side: player.side,
      world,
    });
    return;
  }

  const removed = consumeCurrentInventoryItem(player)!;
  const candidates = getFrontTileCoords(player);
  let dropCoord = localPixelToTile(player.x, player.y);

  for (const coord of candidates) {
    if (!isTileBlocked(grid, coord.x, coord.y)) {
      dropCoord = coord;
      break;
    }
  }

  const dropX = dropCoord.x * TILE_SIZE_PX;
  const dropY = dropCoord.y * TILE_SIZE_PX;

  const droppedEntity: ItemEntity = {
    id: removed.id,
    world,
    x: dropX,
    y: dropY,
    gid: getDefaultItemGid(removed.type, world, removed.lollipopColor),
    item: removed,
  };
  grid.items.push(droppedEntity);

  const persist = state.persistence[state.roomName];
  if (persist) {
    const remIdx = persist.removedItemCoords.findIndex(
      (r) =>
        r.world === world &&
        r.x === dropX &&
        r.y === dropY &&
        r.type === removed.type
    );
    if (remIdx !== -1) {
      persist.removedItemCoords.splice(remIdx, 1);
    } else {
      persist.addedItems.push({
        id: removed.id,
        world,
        x: dropX,
        y: dropY,
        item: { ...removed },
      });
    }
  }

  emitEvent(state, {
    type: 'playSound',
    sound: 'itemDrop',
    playerId: player.id,
    side: player.side,
    world,
  });
}

function applyWeaponHitToBlobbies(
  state: GameState,
  player: PlayerState,
  world: WorldType,
  grid: WorldGridState,
  weapon: WeaponType
): void {
  if (player.attackState.hasDealtKnockback) return;

  for (const blobby of grid.blobbies) {
    if (nextToAndFace(player, blobby.x, blobby.y) !== Direction.None) {
      knockbackBlobby(grid, blobby, player);
      player.attackState.hasDealtKnockback = true;
      emitEvent(state, {
        type: 'playSound',
        sound: weapon === 'FryingPan' ? 'fryingPanHit' : 'shortAttack',
        playerId: player.id,
        side: player.side,
        world,
      });
      emitEvent(state, {
        type: 'playSound',
        sound: 'damage',
        playerId: player.id,
        side: player.side,
        world,
      });
      break;
    }
  }
}

function handleUseCurrentItem(
  state: GameState,
  player: PlayerState,
  world: WorldType,
  grid: WorldGridState
): void {
  if (player.inventory.length === 0) return;
  const idx = Math.min(player.currentItemIndex, player.inventory.length - 1);
  const currentItem = player.inventory[idx];
  if (!currentItem) return;

  const otherWorld: WorldType = world === 'neutral' ? 'dangerous' : 'neutral';
  const otherGrid = state.room.worlds[otherWorld];

  switch (currentItem.type) {
    case 'Broom':
    case 'FryingPan':
    case 'Plunger': {
      if (player.attackState.active && player.attackState.timerMs > 0) {
        return;
      }
      player.attackState = {
        active: true,
        weapon: currentItem.type,
        timerMs: 500,
        direction: player.direction,
        hasDealtKnockback: false,
      };
      emitEvent(state, {
        type: 'playSound',
        sound: 'weaponSwoosh',
        playerId: player.id,
        side: player.side,
        world,
      });

      // Shrink any DimensionTear on the front tile (or player's own tile)
      const frontCandidates = getFrontTileCoords(player);
      for (const coord of frontCandidates) {
        const tear = state.room.tears.find(
          (t) =>
            localPixelToTile(t.x, t.y).x === coord.x &&
            localPixelToTile(t.x, t.y).y === coord.y
        );
        if (tear) {
          shrinkTear(state, tear);
          break;
        }
      }

      // Knock back any Blobby within 1 tile in facing direction
      applyWeaponHitToBlobbies(state, player, world, grid, currentItem.type);
      return;
    }

    case 'Key':
    case 'BlackKey': {
      const targetKind = currentItem.type === 'Key' ? 'LockedDoor' : 'BlackDoor';
      const door = grid.doors.find(
        (d) =>
          d.kind === targetKind &&
          !d.unlocked &&
          (d.id === player.interactingObjectId ||
            nextToAndFace(player, d.x, d.y) !== Direction.None ||
            isWithinTileRange(player.x, player.y, d.x, d.y, 1.5))
      );
      if (door) {
        door.unlocked = true;
        door.popUpText =
          targetKind === 'BlackDoor'
            ? 'The black door is unlocked!'
            : 'The door is unlocked!';
        const linked = otherGrid.doors.find((d) => d.id === door.linkedDoorId);
        if (linked) {
          linked.unlocked = true;
          linked.popUpText = door.popUpText;
        }

        const persist = state.persistence[state.roomName];
        if (persist) {
          persist.unlockedDoorCoords.push({
            world,
            x: door.x,
            y: door.y,
          });
        }

        emitEvent(state, {
          type: 'playSound',
          sound: 'doorUnlocking',
          playerId: player.id,
          side: player.side,
          world,
        });
        consumeCurrentInventoryItem(player);
      }
      return;
    }

    case 'RedGem':
    case 'BlueGem':
    case 'GreenGem': {
      const allStatues = [
        ...state.room.worlds.neutral.statues,
        ...state.room.worlds.dangerous.statues,
      ];
      const nearbyStatue = allStatues.find(
        (s) =>
          s.id === player.interactingObjectId ||
          nextToAndFace(player, s.x, s.y) !== Direction.None ||
          isWithinTileRange(player.x, player.y, s.x, s.y, 1.5)
      );
      if (!nearbyStatue) return;

      for (const statue of allStatues) {
        if (currentItem.type === 'RedGem') statue.hasRedGem = true;
        if (currentItem.type === 'BlueGem') statue.hasBlueGem = true;
        if (currentItem.type === 'GreenGem') statue.hasGreenGem = true;
        statue.popUpText = formatStatuePopUpText(statue);
      }

      const persist = state.persistence[state.roomName];
      if (persist) {
        if (currentItem.type === 'RedGem') persist.statue.hasRedGem = true;
        if (currentItem.type === 'BlueGem') persist.statue.hasBlueGem = true;
        if (currentItem.type === 'GreenGem') persist.statue.hasGreenGem = true;
      }

      emitEvent(state, {
        type: 'playSound',
        sound: 'doorUnlocking',
        playerId: player.id,
        side: player.side,
        world,
      });
      emitEvent(state, {
        type: 'playSound',
        sound: 'chimes',
        playerId: player.id,
        side: player.side,
        world,
      });

      const primaryStatue = allStatues[0];
      if (
        primaryStatue.hasRedGem &&
        primaryStatue.hasBlueGem &&
        primaryStatue.hasGreenGem &&
        !primaryStatue.blackKeySpawned
      ) {
        for (const s of allStatues) {
          s.blackKeySpawned = true;
        }
        if (persist) {
          persist.statue.blackKeySpawned = true;
        }

        const keyWorld = primaryStatue.world;
        const keyX = primaryStatue.x;
        const keyY = primaryStatue.y - TILE_SIZE_PX;
        const keyData: ItemData = {
          id: `${state.roomName}_spawned_blackKey_${state.tick}`,
          type: 'BlackKey',
          popUpText: getDefaultItemPopUpText('BlackKey'),
        };
        state.room.worlds[keyWorld].items.push({
          id: keyData.id,
          world: keyWorld,
          x: keyX,
          y: keyY,
          gid: getDefaultItemGid('BlackKey', keyWorld),
          item: keyData,
        });
        if (persist) {
          persist.addedItems.push({
            id: keyData.id,
            world: keyWorld,
            x: keyX,
            y: keyY,
            item: { ...keyData },
          });
        }
      }

      consumeCurrentInventoryItem(player);
      return;
    }

    case 'Chips':
    case 'WaterBottle':
    case 'Sandwich':
    case 'Lollipop': {
      player.speed = Math.min(MAX_PLAYER_SPEED, player.speed * 1.5);
      player.healthState = getHealthStateForSpeed(player.speed);
      emitEvent(state, {
        type: 'playSound',
        sound: 'eatingFood',
        playerId: player.id,
        side: player.side,
        world,
      });
      emitEvent(state, {
        type: 'flashScreen',
        color: 'green',
        durationMs: 250,
        maxOpacity: 0.5,
        playerId: player.id,
        side: player.side,
        world,
      });
      consumeCurrentInventoryItem(player);
      return;
    }

    case 'Flashlight':
    case 'Flashlight2':
    case 'Lantern': {
      const targetMode: FlashlightMode =
        currentItem.type === 'Flashlight'
          ? 'flashlight1'
          : currentItem.type === 'Flashlight2'
            ? 'flashlight2'
            : 'lantern';
      player.flashlightMode =
        player.flashlightMode === targetMode ? 'none' : targetMode;
      emitEvent(state, {
        type: 'playSound',
        sound: 'flashlightOnOff',
        playerId: player.id,
        side: player.side,
        world,
      });
      return;
    }
  }
}

export interface PlayerSeqTracker {
  useItemSeq: number;
  interactSeq: number;
  inventoryCycleSeq: number;
  inventoryDropSeq: number;
  pingSeq: number;
}

export function updateSinglePlayer(
  state: GameState,
  playerIndex: 0 | 1,
  dtMs: number,
  input: PlayerInput,
  seqTracker: PlayerSeqTracker
): void {
  const player = state.players[playerIndex];
  const otherPlayer = state.players[playerIndex === 0 ? 1 : 0];
  if (!player.isAlive) return;

  const world = getWorldForSide(player.side, state.evilOnLeft);
  const grid = state.room.worlds[world];
  const otherWorld: WorldType = world === 'neutral' ? 'dangerous' : 'neutral';
  const otherGrid = state.room.worlds[otherWorld];

  // 1. Passive speed regeneration (+0.1 every 5000ms up to 2.0)
  if (player.speed < MAX_PLAYER_SPEED) {
    player.regenTimerMs += dtMs;
    while (player.regenTimerMs >= 5000 && player.speed < MAX_PLAYER_SPEED) {
      player.regenTimerMs -= 5000;
      player.speed = Math.min(
        MAX_PLAYER_SPEED,
        Math.round((player.speed + 0.1) * 1000) / 1000
      );
      player.healthState = getHealthStateForSpeed(player.speed);
    }
  } else {
    player.regenTimerMs = 0;
  }

  // 2. Inventory display timer & ping timer
  if (player.inventoryDisplayTimerMs > 0) {
    player.inventoryDisplayTimerMs = Math.max(
      0,
      player.inventoryDisplayTimerMs - dtMs
    );
  }
  if (player.ping && player.ping.active) {
    player.ping.remainingMs = Math.max(0, player.ping.remainingMs - dtMs);
    if (player.ping.remainingMs <= 0) {
      player.ping = null;
    }
  }

  // 3. Movement & collision
  const { direction, isMoving } = computeDirectionFromInput(
    input,
    player.direction
  );
  player.direction = direction;
  player.isMoving = isMoving;

  if (isMoving) {
    player.flashLightDir = direction;
    player.velocity = computeVelocityForDirection(
      direction,
      player.speed,
      player.boxColliding
    );
    // Cancel active weapon swing when walking (matches legacy player.js)
    player.attackState.active = false;
    player.attackState.timerMs = 0;
    player.attackState.weapon = null;
    player.attackState.hasDealtKnockback = false;

    const oldX = player.x;
    const oldY = player.y;

    // X-axis step
    const nextX = player.x + player.velocity.x;
    const hitDoorX = findCollidingDoor(grid, nextX, player.y);
    if (hitDoorX) {
      hitDoorX.playerAtDoor = true;
      player.atDoorId = hitDoorX.id;
    } else if (!doesPlayerCollideWithWalls(grid, nextX, player.y)) {
      player.x = nextX;
    }

    // Y-axis step
    const nextY = player.y + player.velocity.y;
    const hitDoorY = findCollidingDoor(grid, player.x, nextY);
    if (hitDoorY) {
      hitDoorY.playerAtDoor = true;
      player.atDoorId = hitDoorY.id;
    } else if (!doesPlayerCollideWithWalls(grid, player.x, nextY)) {
      player.y = nextY;
    }

    // Linked cross-dimension Box pushing
    const overlappedBox = findOverlappingBox(grid, player.x, player.y);
    if (overlappedBox) {
      player.boxColliding = true;
      const dx = player.x - oldX;
      const dy = player.y - oldY;
      const linkedBox = otherGrid.boxes.find(
        (b) => b.id === overlappedBox.linkedBoxId
      );

      if (dx !== 0) {
        overlappedBox.x += dx;
        if (linkedBox) linkedBox.x += dx;

        const blocked =
          doesBoxCollide(grid, overlappedBox) ||
          (linkedBox ? doesBoxCollide(otherGrid, linkedBox, otherPlayer) : false);
        if (blocked) {
          overlappedBox.x -= dx;
          if (linkedBox) linkedBox.x -= dx;
          player.x = oldX;
        }
      }

      if (dy !== 0) {
        overlappedBox.y += dy;
        if (linkedBox) linkedBox.y += dy;

        const blocked =
          doesBoxCollide(grid, overlappedBox) ||
          (linkedBox ? doesBoxCollide(otherGrid, linkedBox, otherPlayer) : false);
        if (blocked) {
          overlappedBox.y -= dy;
          if (linkedBox) linkedBox.y -= dy;
          player.y = oldY;
        }
      }
    } else {
      player.boxColliding = false;
    }
  } else {
    player.velocity = { x: 0, y: 0 };
    if (player.attackState.active && player.attackState.timerMs > 0) {
      if (player.attackState.weapon) {
        applyWeaponHitToBlobbies(
          state,
          player,
          world,
          grid,
          player.attackState.weapon
        );
      }
      player.attackState.timerMs = Math.max(
        0,
        player.attackState.timerMs - dtMs
      );
      if (player.attackState.timerMs <= 0) {
        player.attackState.active = false;
        player.attackState.weapon = null;
        player.attackState.hasDealtKnockback = false;
      }
    }
  }

  // Swoosh trigger check in monsterIntro (any tile overlapped by player hitbox)
  if (!state.room.swooshTriggered) {
    const minTx = Math.max(
      0,
      Math.floor((player.x + PLAYER_HITBOX_MIN) / TILE_SIZE_PX)
    );
    const maxTx = Math.min(
      DIM_WIDTH_TILES - 1,
      Math.floor((player.x + PLAYER_HITBOX_MAX - 0.001) / TILE_SIZE_PX)
    );
    const minTy = Math.max(
      0,
      Math.floor((player.y + PLAYER_HITBOX_MIN) / TILE_SIZE_PX)
    );
    const maxTy = Math.min(
      DIM_HEIGHT_TILES - 1,
      Math.floor((player.y + PLAYER_HITBOX_MAX - 0.001) / TILE_SIZE_PX)
    );
    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let ty = minTy; ty <= maxTy; ty++) {
        if (grid.cells[tx]?.[ty]?.hasSwooshTrigger) {
          state.room.swooshTriggered = true;
          if (state.persistence[state.roomName]) {
            state.persistence[state.roomName].swooshTriggered = true;
          }
          emitEvent(state, {
            type: 'playSound',
            sound: 'swoosh',
            playerId: player.id,
            side: player.side,
            world,
          });
          break;
        }
      }
      if (state.room.swooshTriggered) break;
    }
  }

  // 4. Update hover / interactable object
  updatePlayerInteractableHover(player, grid);

  // 5. Discrete sequence-numbered actions
  if (input.interactSeq > seqTracker.interactSeq) {
    seqTracker.interactSeq = input.interactSeq;
    handlePlayerInteract(state, player, world, grid);
  }
  if (input.inventoryCycleSeq > seqTracker.inventoryCycleSeq) {
    seqTracker.inventoryCycleSeq = input.inventoryCycleSeq;
    handleInventoryCycle(state, player, world);
  }
  if (input.inventoryDropSeq > seqTracker.inventoryDropSeq) {
    seqTracker.inventoryDropSeq = input.inventoryDropSeq;
    handleInventoryDrop(state, player, world, grid);
  }
  if (input.useItemSeq > seqTracker.useItemSeq) {
    seqTracker.useItemSeq = input.useItemSeq;
    handleUseCurrentItem(state, player, world, grid);
  }
  if (input.pingSeq > seqTracker.pingSeq) {
    seqTracker.pingSeq = input.pingSeq;
    player.ping = {
      active: true,
      x: player.x,
      y: player.y,
      kind: input.pingKind ?? 'here',
      remainingMs: 3000,
    };
  }
}
