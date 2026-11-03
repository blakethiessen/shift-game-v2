// src/core/monstersAndTears.ts
// Pure TypeScript monster AI (Blobby sightline detection, A* chase, diagonal knockback, Eating),
// EvilLamp 600ms ambush wind-up & attack cooldown, and DimensionTear growth/spread/regrowth/spawning.

import {
  BlobbyEntity,
  DEFAULT_BLOBBY_MAX_HP,
  DIM_HEIGHT_TILES,
  DIM_WIDTH_TILES,
  DimensionTearEntity,
  Direction,
  GameState,
  getSideForWorld,
  localPixelToTile,
  PlayerState,
  SeededRandom,
  TILE_SIZE_PX,
  TileCoord,
  WorldGridState,
  WorldType,
} from '../shared/types';
import { findPath, isTileBlocked, isTileInBounds } from './pathfinding';
import { emitEvent, isWithinTileRange, takeDamage } from './playerLogic';

const CHASING_SPEED = 2.4;
const WANDERING_SPEED = 0.8;
const ACCELERATION = 0.05;
const TEAR_GROWTH_MS = 3000;
const TEAR_REGROWTH_MS = 9000;

export function isTargetDetected(
  grid: WorldGridState,
  blobbyCoord: TileCoord,
  targetCoord: TileCoord
): boolean {
  const dx = targetCoord.x - blobbyCoord.x;
  const dy = targetCoord.y - blobbyCoord.y;

  // Same tile or orthogonally adjacent
  if (Math.abs(dx) + Math.abs(dy) <= 1) {
    return true;
  }

  // Knight-move sightline with unblocked intermediate corner tiles
  if (Math.abs(dx) === 2 && Math.abs(dy) === 1) {
    const midX = blobbyCoord.x + Math.sign(dx);
    if (
      !isTileBlocked(grid, midX, blobbyCoord.y) &&
      !isTileBlocked(grid, midX, targetCoord.y)
    ) {
      return true;
    }
  }

  // Straight vertical line of sight
  if (dx === 0) {
    const startY = Math.min(blobbyCoord.y, targetCoord.y);
    const endY = Math.max(blobbyCoord.y, targetCoord.y);
    for (let y = startY; y < endY; y++) {
      if (isTileBlocked(grid, blobbyCoord.x, y)) {
        return false;
      }
    }
    return true;
  }

  // Straight horizontal line of sight
  if (dy === 0) {
    const startX = Math.min(blobbyCoord.x, targetCoord.x);
    const endX = Math.max(blobbyCoord.x, targetCoord.x);
    for (let x = startX; x < endX; x++) {
      if (isTileBlocked(grid, x, blobbyCoord.y)) {
        return false;
      }
    }
    return true;
  }

  return false;
}

export function startBlobbyWandering(blobby: BlobbyEntity): void {
  blobby.state = 'Wandering';
  blobby.nextStep = null;
  blobby.velocity = { x: 0, y: 0 };
  blobby.currentSpeed = WANDERING_SPEED;
}

function setBlobbyVelocityToNextStep(
  blobby: BlobbyEntity,
  blobbyCoord: TileCoord
): void {
  blobby.velocity = { x: 0, y: 0 };
  if (!blobby.nextStep) {
    startBlobbyWandering(blobby);
    return;
  }

  if (blobbyCoord.y < blobby.nextStep.y) {
    blobby.velocity.y = blobby.currentSpeed;
    blobby.direction = Direction.Down;
  } else if (blobbyCoord.y > blobby.nextStep.y) {
    blobby.velocity.y = -blobby.currentSpeed;
    blobby.direction = Direction.Up;
  }

  if (blobbyCoord.x < blobby.nextStep.x) {
    blobby.velocity.x = blobby.currentSpeed;
    if (blobby.velocity.y < 0) {
      blobby.velocity.x *= 0.5;
      blobby.velocity.y *= 0.5;
      blobby.direction = Direction.UpRight;
    } else if (blobby.velocity.y > 0) {
      blobby.velocity.x *= 0.5;
      blobby.velocity.y *= 0.5;
      blobby.direction = Direction.DownRight;
    } else {
      blobby.direction = Direction.Right;
    }
  } else if (blobbyCoord.x > blobby.nextStep.x) {
    blobby.velocity.x = -blobby.currentSpeed;
    if (blobby.velocity.y < 0) {
      blobby.velocity.x *= 0.5;
      blobby.velocity.y *= 0.5;
      blobby.direction = Direction.UpLeft;
    } else if (blobby.velocity.y > 0) {
      blobby.velocity.x *= 0.5;
      blobby.velocity.y *= 0.5;
      blobby.direction = Direction.DownLeft;
    } else {
      blobby.direction = Direction.Left;
    }
  }

  if (
    blobbyCoord.x === blobby.nextStep.x &&
    blobbyCoord.y === blobby.nextStep.y
  ) {
    startBlobbyWandering(blobby);
  }
}

function hasBlobbyReachedTile(
  blobby: BlobbyEntity,
  tile: TileCoord | null
): boolean {
  if (!tile) return false;
  const posX = tile.x * TILE_SIZE_PX;
  const posY = tile.y * TILE_SIZE_PX;
  const vx = blobby.velocity.x;
  const vy = blobby.velocity.y;

  let reached = false;
  if (vy === 0) {
    reached = (blobby.x - posX) * (blobby.x + vx - posX) <= 0;
  } else if (vx === 0) {
    reached = (blobby.y - posY) * (blobby.y + vy - posY) <= 0;
  } else {
    reached =
      (blobby.x - posX) * (blobby.x + vx - posX) <= 0 ||
      (blobby.y - posY) * (blobby.y + vy - posY) <= 0;
  }

  if (reached) {
    blobby.x = posX;
    blobby.y = posY;
    return true;
  }
  return false;
}

function accelerateBlobby(blobby: BlobbyEntity): void {
  const diagFactor =
    blobby.velocity.x !== 0 && blobby.velocity.y !== 0 ? 0.7 : 1;

  if (blobby.velocity.x > 0) {
    if (blobby.velocity.x >= CHASING_SPEED) {
      blobby.velocity.x = CHASING_SPEED * diagFactor;
    } else {
      blobby.velocity.x += ACCELERATION * diagFactor;
      blobby.currentSpeed = Math.min(
        CHASING_SPEED,
        blobby.currentSpeed + ACCELERATION
      );
    }
  } else if (blobby.velocity.x < 0) {
    if (blobby.velocity.x <= -CHASING_SPEED) {
      blobby.velocity.x = -CHASING_SPEED * diagFactor;
    } else {
      blobby.velocity.x -= ACCELERATION * diagFactor;
      blobby.currentSpeed = Math.min(
        CHASING_SPEED,
        blobby.currentSpeed + ACCELERATION
      );
    }
  } else if (blobby.velocity.y > 0) {
    if (blobby.velocity.y >= CHASING_SPEED) {
      blobby.velocity.y = CHASING_SPEED * diagFactor;
    } else {
      blobby.velocity.y += ACCELERATION * diagFactor;
      blobby.currentSpeed = Math.min(
        CHASING_SPEED,
        blobby.currentSpeed + ACCELERATION
      );
    }
  } else if (blobby.velocity.y < 0) {
    if (blobby.velocity.y <= -CHASING_SPEED) {
      blobby.velocity.y = -CHASING_SPEED * diagFactor;
    } else {
      blobby.velocity.y -= ACCELERATION * diagFactor;
      blobby.currentSpeed = Math.min(
        CHASING_SPEED,
        blobby.currentSpeed + ACCELERATION
      );
    }
  }
}

export function knockbackBlobby(
  grid: WorldGridState,
  blobby: BlobbyEntity,
  player: PlayerState
): void {
  const blobbyCoord = localPixelToTile(blobby.x, blobby.y);
  const playerCoord = localPixelToTile(player.x, player.y);

  let stepX = -Math.sign(blobby.velocity.x);
  let stepY = -Math.sign(blobby.velocity.y);

  if (stepX === 0 && stepY === 0) {
    stepX = Math.sign(blobbyCoord.x - playerCoord.x);
    stepY = Math.sign(blobbyCoord.y - playerCoord.y);
  }
  if (stepX === 0 && stepY === 0) {
    if (player.direction === Direction.Left) stepX = -1;
    else if (player.direction === Direction.Right) stepX = 1;
    else if (player.direction === Direction.Up) stepY = -1;
    else stepY = 1;
  }

  let targetX = blobbyCoord.x;
  let targetY = blobbyCoord.y;

  for (let k = 1; k <= 3; k++) {
    const candX = blobbyCoord.x + stepX * k;
    const candY = blobbyCoord.y + stepY * k;
    if (!isTileBlocked(grid, candX, candY)) {
      targetX = candX;
      targetY = candY;
    } else if (stepX !== 0 && stepY !== 0) {
      // If diagonal fallback is blocked, try orthogonal fallback along X or Y
      if (!isTileBlocked(grid, blobbyCoord.x + stepX * k, targetY)) {
        targetX = blobbyCoord.x + stepX * k;
      } else if (!isTileBlocked(grid, targetX, blobbyCoord.y + stepY * k)) {
        targetY = blobbyCoord.y + stepY * k;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  blobby.nextStep = { x: targetX, y: targetY };
  setBlobbyVelocityToNextStep(blobby, blobbyCoord);
  blobby.velocity.x *= 2;
  blobby.velocity.y *= 2;

  if (blobby.velocity.x === 0 && blobby.velocity.y === 0) {
    startBlobbyWandering(blobby);
  } else {
    blobby.state = 'Shocking';
  }
}

function trySetRandomWanderVelocity(
  grid: WorldGridState,
  blobby: BlobbyEntity,
  blobbyCoord: TileCoord,
  rng: SeededRandom
): void {
  const dir = rng.nextInt(1, 8) as Direction;
  const cx = blobbyCoord.x;
  const cy = blobbyCoord.y;

  let nx = cx;
  let ny = cy;
  let vx = 0;
  let vy = 0;

  switch (dir) {
    case Direction.Down:
      if (isTileBlocked(grid, cx, cy + 1)) return;
      ny = cy + 1;
      vy = WANDERING_SPEED;
      break;
    case Direction.Up:
      if (isTileBlocked(grid, cx, cy - 1)) return;
      ny = cy - 1;
      vy = -WANDERING_SPEED;
      break;
    case Direction.Right:
      if (isTileBlocked(grid, cx + 1, cy)) return;
      nx = cx + 1;
      vx = WANDERING_SPEED;
      break;
    case Direction.Left:
      if (isTileBlocked(grid, cx - 1, cy)) return;
      nx = cx - 1;
      vx = -WANDERING_SPEED;
      break;
    case Direction.DownLeft:
      if (
        isTileBlocked(grid, cx - 1, cy + 1) ||
        isTileBlocked(grid, cx, cy + 1) ||
        isTileBlocked(grid, cx - 1, cy)
      )
        return;
      nx = cx - 1;
      ny = cy + 1;
      vx = -WANDERING_SPEED;
      vy = WANDERING_SPEED;
      break;
    case Direction.DownRight:
      if (
        isTileBlocked(grid, cx + 1, cy + 1) ||
        isTileBlocked(grid, cx, cy + 1) ||
        isTileBlocked(grid, cx + 1, cy)
      )
        return;
      nx = cx + 1;
      ny = cy + 1;
      vx = WANDERING_SPEED;
      vy = WANDERING_SPEED;
      break;
    case Direction.UpRight:
      if (
        isTileBlocked(grid, cx + 1, cy - 1) ||
        isTileBlocked(grid, cx, cy - 1) ||
        isTileBlocked(grid, cx + 1, cy)
      )
        return;
      nx = cx + 1;
      ny = cy - 1;
      vx = WANDERING_SPEED;
      vy = -WANDERING_SPEED;
      break;
    case Direction.UpLeft:
      if (
        isTileBlocked(grid, cx - 1, cy - 1) ||
        isTileBlocked(grid, cx, cy - 1) ||
        isTileBlocked(grid, cx - 1, cy)
      )
        return;
      nx = cx - 1;
      ny = cy - 1;
      vx = -WANDERING_SPEED;
      vy = -WANDERING_SPEED;
      break;
  }

  blobby.nextStep = { x: nx, y: ny };
  blobby.velocity = { x: vx, y: vy };
  blobby.direction = dir;
  blobby.currentSpeed = WANDERING_SPEED;
}

function updateBlobbyPath(
  state: GameState,
  grid: WorldGridState,
  blobby: BlobbyEntity,
  blobbyCoord: TileCoord,
  targetPlayer: PlayerState,
  targetCoord: TileCoord,
  rng: SeededRandom
): boolean {
  if (blobbyCoord.x === targetCoord.x && blobbyCoord.y === targetCoord.y) {
    emitEvent(state, {
      type: 'playSound',
      sound: 'growl2',
      playerId: targetPlayer.id,
      side: targetPlayer.side,
      world: grid.world,
    });
    takeDamage(state, targetPlayer.id, 0.8);
    blobby.velocity.x *= 0.2525;
    blobby.velocity.y *= 0.2525;
    blobby.eatingTimerTicks = 0;
    blobby.state = 'Eating';
    return true;
  }

  if (
    targetCoord.x !== blobby.oldTargetCoord.x ||
    targetCoord.y !== blobby.oldTargetCoord.y ||
    blobby.state === 'Wandering'
  ) {
    const path = findPath(grid, blobbyCoord, targetCoord);
    if (path.length === 0) {
      return false;
    }

    const wasWandering = blobby.state === 'Wandering';
    blobby.path = path;
    blobby.oldTargetCoord = { ...path[path.length - 1] };
    blobby.nextStepIdx = 0;
    blobby.nextStep = { ...path[0] };
    setBlobbyVelocityToNextStep(blobby, blobbyCoord);
    blobby.state = 'Seeking';

    if (wasWandering) {
      emitEvent(state, {
        type: 'playSound',
        sound: 'blobbyTracking',
        playerId: targetPlayer.id,
        side: targetPlayer.side,
        world: grid.world,
      });
      emitEvent(state, {
        type: 'playSound',
        sound: rng.nextInt(0, 1) === 0 ? 'growl1' : 'growl4',
        playerId: targetPlayer.id,
        side: targetPlayer.side,
        world: grid.world,
      });
    }
    return true;
  }

  return false;
}

function computeSpreadAngle(
  room: GameState['room'],
  coord: TileCoord,
  nx: number,
  ny: number
): Direction {
  const hasTearAt = (tx: number, ty: number): boolean =>
    room.tears.some(
      (t) =>
        localPixelToTile(t.x, t.y).x === tx &&
        localPixelToTile(t.x, t.y).y === ty
    );

  if (nx === coord.x - 1) {
    if (ny === coord.y - 1) {
      if (hasTearAt(coord.x - 1, coord.y)) return Direction.Up;
      if (hasTearAt(coord.x, coord.y - 1)) return Direction.Left;
      return Direction.UpLeft;
    }
    if (ny === coord.y) return Direction.Left;
    if (hasTearAt(coord.x - 1, coord.y)) return Direction.Down;
    if (hasTearAt(coord.x, coord.y + 1)) return Direction.Left;
    return Direction.DownLeft;
  }

  if (nx === coord.x) {
    return ny === coord.y - 1 ? Direction.Up : Direction.Down;
  }

  if (ny === coord.y - 1) {
    if (hasTearAt(coord.x + 1, coord.y)) return Direction.Up;
    if (hasTearAt(coord.x, coord.y - 1)) return Direction.Right;
    return Direction.UpRight;
  }
  if (ny === coord.y) return Direction.Right;
  if (hasTearAt(coord.x + 1, coord.y)) return Direction.Down;
  if (hasTearAt(coord.x, coord.y + 1)) return Direction.Right;
  return Direction.DownRight;
}

function isValidTearCell(grid: WorldGridState, x: number, y: number): boolean {
  if (!isTileInBounds(x, y)) return false;
  if (isTileBlocked(grid, x, y)) return false;
  const cell = grid.cells[x][y];
  const hasDoor = grid.doors.some(
    (d) =>
      Math.floor(d.x / TILE_SIZE_PX) === x &&
      Math.floor(d.y / TILE_SIZE_PX) === y
  );
  if (hasDoor) return false;
  return cell.floorGid > 0 || cell.wallOverlayGid > 0;
}

export function spreadTear(state: GameState, tear: DimensionTearEntity): void {
  const coord = localPixelToTile(tear.x, tear.y);
  const neutralGrid = state.room.worlds.neutral;
  const newTears: DimensionTearEntity[] = [];

  for (let nx = coord.x - 1; nx <= coord.x + 1; nx++) {
    for (let ny = coord.y - 1; ny <= coord.y + 1; ny++) {
      if (nx === coord.x && ny === coord.y) continue;
      if (!isValidTearCell(neutralGrid, nx, ny)) continue;

      const px = nx * TILE_SIZE_PX;
      const py = ny * TILE_SIZE_PX;
      const alreadyHasTear =
        state.room.tears.some((t) => t.x === px && t.y === py) ||
        newTears.some((t) => t.x === px && t.y === py);
      if (alreadyHasTear) continue;

      const angle = computeSpreadAngle(state.room, coord, nx, ny);
      newTears.push({
        id: `${state.roomName}_tear_${px}_${py}_${state.tick}_${newTears.length}`,
        x: px,
        y: py,
        angle,
        stage: 0,
        growthTimerMs: TEAR_GROWTH_MS,
        hasSpread: false,
      });
    }
  }

  if (newTears.length > 0) {
    state.room.tears.push(...newTears);
    emitEvent(state, {
      type: 'playSound',
      sound: 'chimes',
    });
  }
}

export function shrinkTear(state: GameState, tear: DimensionTearEntity): void {
  tear.lastHitTick = state.tick;
  if (tear.stage > 0) {
    tear.stage--;
    tear.growthTimerMs = TEAR_GROWTH_MS;
    tear.hasSpread = false;
  } else {
    const idx = state.room.tears.findIndex((t) => t.id === tear.id);
    if (idx !== -1) {
      state.room.tears.splice(idx, 1);
    }
    state.room.pendingRegrowths.push({
      x: tear.x,
      y: tear.y,
      angle: tear.angle,
      remainingMs: TEAR_REGROWTH_MS,
    });
  }
}

export function spawnInitialTearsForRoom(
  state: GameState,
  rng: SeededRandom
): void {
  // First 3 rooms are guaranteed to have no cracks.
  if (state.roomsEntered <= 3) return;

  // From room 4 onwards, ramp up crack possibility starting gently (effective rooms = 1 at room 4, 2 at room 5)
  const effectiveRooms = state.roomsEntered - 3;
  let numCracks = 0;
  let minimumValue = 0.01;
  while (Math.pow(rng.nextFloat(), effectiveRooms) < minimumValue) {
    numCracks++;
    minimumValue /= 10;
  }

  const neutralGrid = state.room.worlds.neutral;
  const validCoords: TileCoord[] = [];
  for (let x = 0; x < DIM_WIDTH_TILES - 1; x++) {
    for (let y = 0; y < DIM_HEIGHT_TILES - 1; y++) {
      if (isValidTearCell(neutralGrid, x, y)) {
        validCoords.push({ x, y });
      }
    }
  }
  if (validCoords.length === 0) return;

  for (let i = 0; i < numCracks; i++) {
    const picked = validCoords[rng.nextInt(0, validCoords.length - 1)];
    const px = picked.x * TILE_SIZE_PX;
    const py = picked.y * TILE_SIZE_PX;
    if (state.room.tears.some((t) => t.x === px && t.y === py)) continue;

    state.room.tears.push({
      id: `${state.roomName}_init_tear_${i}_${px}_${py}`,
      x: px,
      y: py,
      angle:
        rng.nextFloat() > 0.5 ? Direction.Horizontal : Direction.Vertical,
      stage: 0,
      growthTimerMs: TEAR_GROWTH_MS,
      hasSpread: false,
    });
  }
}

export function updateMonstersAndTears(
  state: GameState,
  dtMs: number,
  rng: SeededRandom
): void {
  const worlds: WorldType[] = ['neutral', 'dangerous'];

  // 1. Update Blobbies & EvilLamps in each world
  for (const world of worlds) {
    const grid = state.room.worlds[world];
    const side = getSideForWorld(world, state.evilOnLeft);
    const targetPlayer =
      state.players[0].side === side ? state.players[0] : state.players[1];

    // Blobbies
    for (const blobby of grid.blobbies) {
      const blobbyCoord = localPixelToTile(blobby.x, blobby.y);
      const targetCoord = localPixelToTile(targetPlayer.x, targetPlayer.y);

      if (blobby.state === 'Wandering') {
        if (
          targetPlayer.isAlive &&
          isTargetDetected(grid, blobbyCoord, targetCoord)
        ) {
          updateBlobbyPath(
            state,
            grid,
            blobby,
            blobbyCoord,
            targetPlayer,
            targetCoord,
            rng
          );
          blobby.wanderTimerTicks = 0;
        } else {
          if (blobby.wanderTimerTicks > 0 && blobby.wanderTimerTicks % 300 === 0) {
            emitEvent(state, {
              type: 'playSound',
              sound: rng.nextInt(0, 1) === 0 ? 'growl3' : 'growl5',
              side,
              world,
            });
          }
          blobby.wanderTimerTicks++;

          const isStaying =
            blobby.velocity.x === 0 && blobby.velocity.y === 0;
          if (isStaying || hasBlobbyReachedTile(blobby, blobby.nextStep)) {
            blobby.wanderIntervalTicks--;
            if (blobby.wanderIntervalTicks < 0) {
              blobby.wanderIntervalTicks = 40;
              trySetRandomWanderVelocity(grid, blobby, blobbyCoord, rng);
            }
          } else {
            blobby.x += blobby.velocity.x;
            blobby.y += blobby.velocity.y;
          }
        }
      } else if (blobby.state === 'Seeking') {
        accelerateBlobby(blobby);

        if (blobbyCoord.x !== targetCoord.x || blobbyCoord.y !== targetCoord.y) {
          if (hasBlobbyReachedTile(blobby, blobby.nextStep)) {
            if (
              !updateBlobbyPath(
                state,
                grid,
                blobby,
                blobbyCoord,
                targetPlayer,
                targetCoord,
                rng
              )
            ) {
              if (blobby.path.length === 0) {
                startBlobbyWandering(blobby);
              } else {
                if (blobby.nextStepIdx < blobby.path.length - 1) {
                  blobby.nextStepIdx++;
                }
                blobby.nextStep = { ...blobby.path[blobby.nextStepIdx] };
                setBlobbyVelocityToNextStep(blobby, blobbyCoord);
              }
            }
          } else {
            blobby.x += blobby.velocity.x;
            blobby.y += blobby.velocity.y;
          }
        } else {
          emitEvent(state, {
            type: 'playSound',
            sound: 'growl2',
            playerId: targetPlayer.id,
            side,
            world,
          });
          takeDamage(state, targetPlayer.id, 0.8);
          blobby.velocity.x *= 0.2525;
          blobby.velocity.y *= 0.2525;
          blobby.eatingTimerTicks = 0;
          blobby.state = 'Eating';
        }
      } else if (blobby.state === 'Shocking') {
        if (hasBlobbyReachedTile(blobby, blobby.nextStep)) {
          startBlobbyWandering(blobby);
        } else {
          blobby.x += blobby.velocity.x;
          blobby.y += blobby.velocity.y;
        }
      } else if (blobby.state === 'Eating') {
        blobby.x += blobby.velocity.x;
        blobby.y += blobby.velocity.y;
        blobby.eatingTimerTicks++;
        if (blobby.eatingTimerTicks > 30) {
          blobby.eatingTimerTicks = 0;
          startBlobbyWandering(blobby);
        }
      }
    }

    // EvilLamps
    for (const evilLamp of grid.evilLamps) {
      if (!evilLamp.isOn || !targetPlayer.isAlive) {
        evilLamp.stage = 'dormant';
        evilLamp.timerMs = 0;
        continue;
      }

      const within1_5 = isWithinTileRange(
        targetPlayer.x,
        targetPlayer.y,
        evilLamp.x,
        evilLamp.y,
        1.5
      );
      const within2_0 = isWithinTileRange(
        targetPlayer.x,
        targetPlayer.y,
        evilLamp.x,
        evilLamp.y,
        2.0
      );

      if (evilLamp.stage === 'dormant') {
        if (within1_5) {
          evilLamp.stage = 'opening';
          evilLamp.timerMs = 600;
          emitEvent(state, {
            type: 'playSound',
            sound: 'creaking1',
            playerId: targetPlayer.id,
            side,
            world,
          });
        }
      } else if (evilLamp.stage === 'opening') {
        if (!within2_0) {
          evilLamp.stage = 'dormant';
          evilLamp.timerMs = 0;
        } else {
          evilLamp.timerMs -= dtMs;
          if (evilLamp.timerMs <= 0) {
            evilLamp.stage = 'attacking';
            emitEvent(state, {
              type: 'playSound',
              sound: 'evilLampAttack',
              playerId: targetPlayer.id,
              side,
              world,
            });
            takeDamage(state, targetPlayer.id, 0.9);
            evilLamp.stage = 'cooldown';
            evilLamp.timerMs = 1000;
          }
        }
      } else if (evilLamp.stage === 'cooldown') {
        evilLamp.timerMs -= dtMs;
        if (evilLamp.timerMs <= 0) {
          evilLamp.stage = 'dormant';
          evilLamp.timerMs = 0;
        }
      }
    }
  }

  // 2. Update DimensionTears growth & spread
  const currentTears = [...state.room.tears];
  for (const tear of currentTears) {
    tear.growthTimerMs -= dtMs;
    while (tear.growthTimerMs <= 0) {
      if (tear.stage < 4) {
        tear.stage++;
        tear.growthTimerMs += TEAR_GROWTH_MS;
      } else if (!tear.hasSpread) {
        tear.hasSpread = true;
        tear.growthTimerMs = TEAR_GROWTH_MS;
        spreadTear(state, tear);
        break;
      } else {
        tear.growthTimerMs = TEAR_GROWTH_MS;
        break;
      }
    }
  }

  // 3. Update pending tear regrowths
  for (let i = state.room.pendingRegrowths.length - 1; i >= 0; i--) {
    const reg = state.room.pendingRegrowths[i];
    reg.remainingMs -= dtMs;
    if (reg.remainingMs <= 0) {
      state.room.pendingRegrowths.splice(i, 1);
      const exists = state.room.tears.some(
        (t) => t.x === reg.x && t.y === reg.y
      );
      if (!exists) {
        state.room.tears.push({
          id: `${state.roomName}_regrown_tear_${reg.x}_${reg.y}_${state.tick}`,
          x: reg.x,
          y: reg.y,
          angle: reg.angle,
          stage: 0,
          growthTimerMs: TEAR_GROWTH_MS,
          hasSpread: false,
        });
      }
    }
  }

  // 4. Spawn Blobby pairs from tears every 24000 / (1 + 0.1 * tears.length) ms up to 10 blobbies
  if (state.room.tears.length > 0) {
    const spawnIntervalMs = 24000 / (1 + 0.1 * state.room.tears.length);
    state.room.blobbySpawnTimerMs += dtMs;
    if (state.room.blobbySpawnTimerMs >= spawnIntervalMs) {
      state.room.blobbySpawnTimerMs = 0;
      const maxExisting = Math.max(
        state.room.worlds.neutral.blobbies.length,
        state.room.worlds.dangerous.blobbies.length
      );
      if (maxExisting < 10) {
        const pickedTear =
          state.room.tears[rng.nextInt(0, state.room.tears.length - 1)];
        for (const world of worlds) {
          state.room.worlds[world].blobbies.push({
            id: `${state.roomName}_tear_blobby_${world}_${state.tick}_${state.room.worlds[world].blobbies.length}`,
            world,
            x: pickedTear.x,
            y: pickedTear.y,
            velocity: { x: 0, y: 0 },
            direction: Direction.Down,
            state: 'Wandering',
            currentSpeed: WANDERING_SPEED,
            wanderTimerTicks: 0,
            wanderIntervalTicks: 40,
            eatingTimerTicks: 0,
            path: [],
            nextStepIdx: 0,
            nextStep: null,
            oldTargetCoord: { x: 0, y: 0 },
            hp: DEFAULT_BLOBBY_MAX_HP,
            maxHp: DEFAULT_BLOBBY_MAX_HP,
          });
        }
      }
    }
  }
}
