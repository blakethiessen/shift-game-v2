// src/core/pathfinding.ts
// Pure TypeScript 8-directional A* pathfinder with diagonal corner-cutting prevention
// and nearest-free-tile BFS helper for anti-softlock wall-shift ejection.

import {
  BoxEntity,
  DIM_HEIGHT_TILES,
  DIM_WIDTH_TILES,
  localPixelToTile,
  TILE_SIZE_PX,
  TileCoord,
  WorldGridState,
} from '../shared/types';

interface AStarNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: AStarNode | null;
}

const NEIGHBOR_OFFSETS: ReadonlyArray< readonly [number, number] > = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const BFS_OFFSETS: ReadonlyArray< readonly [number, number] > = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

export function isTileInBounds(x: number, y: number): boolean {
  return x >= 0 && x < DIM_WIDTH_TILES && y >= 0 && y < DIM_HEIGHT_TILES;
}

export function isTileBlocked(
  grid: WorldGridState,
  x: number,
  y: number
): boolean {
  if (!isTileInBounds(x, y)) {
    return true;
  }
  const cell = grid.cells[x]?.[y];
  if (
    !cell ||
    cell.collides ||
    cell.noLight ||
    cell.isHole ||
    cell.isWallDoor
  ) {
    return true;
  }
  // Check for closed/locked door on this tile
  const hasLockedDoor = grid.doors.some(
    (d) =>
      Math.floor(d.x / TILE_SIZE_PX) === x &&
      Math.floor(d.y / TILE_SIZE_PX) === y &&
      !d.unlocked
  );
  if (hasLockedDoor) {
    return true;
  }
  return false;
}

function canStep(
  grid: WorldGridState,
  prevX: number,
  prevY: number,
  nextX: number,
  nextY: number
): boolean {
  if (isTileBlocked(grid, nextX, nextY)) {
    return false;
  }
  // Diagonal corner-cutting prevention: both orthogonal neighbors must be unblocked
  if (prevX !== nextX && prevY !== nextY) {
    if (
      isTileBlocked(grid, prevX, nextY) ||
      isTileBlocked(grid, nextX, prevY)
    ) {
      return false;
    }
  }
  return true;
}

export function findPath(
  grid: WorldGridState,
  start: TileCoord,
  target: TileCoord
): TileCoord[] {
  if (
    !isTileInBounds(start.x, start.y) ||
    !isTileInBounds(target.x, target.y)
  ) {
    return [];
  }
  if (start.x === target.x && start.y === target.y) {
    return [];
  }
  if (isTileBlocked(grid, target.x, target.y)) {
    return [];
  }

  const openList: AStarNode[] = [];
  const closedSet = new Set<number>();

  const startNode: AStarNode = {
    x: start.x,
    y: start.y,
    g: 0,
    h: 10 * (Math.abs(target.x - start.x) + Math.abs(target.y - start.y)),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.g + startNode.h;
  openList.push(startNode);

  while (openList.length > 0) {
    let lowestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].f < openList[lowestIdx].f) {
        lowestIdx = i;
      }
    }

    const curNode = openList[lowestIdx];
    if (curNode.x === target.x && curNode.y === target.y) {
      const path: TileCoord[] = [];
      let curr: AStarNode | null = curNode;
      while (curr !== null && curr !== startNode) {
        path.unshift({ x: curr.x, y: curr.y });
        curr = curr.parent;
      }
      return path;
    }

    openList.splice(lowestIdx, 1);
    closedSet.add(curNode.y * DIM_WIDTH_TILES + curNode.x);

    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const nx = curNode.x + dx;
      const ny = curNode.y + dy;
      if (!isTileInBounds(nx, ny)) continue;

      const key = ny * DIM_WIDTH_TILES + nx;
      if (closedSet.has(key)) continue;

      if (!canStep(grid, curNode.x, curNode.y, nx, ny)) continue;

      const deltaG = dx === 0 || dy === 0 ? 10 : 14;
      const tentativeG = curNode.g + deltaG;

      const existing = openList.find((n) => n.x === nx && n.y === ny);
      if (!existing) {
        const h = 10 * (Math.abs(target.x - nx) + Math.abs(target.y - ny));
        openList.push({
          x: nx,
          y: ny,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: curNode,
        });
      } else if (tentativeG < existing.g) {
        existing.g = tentativeG;
        existing.f = tentativeG + existing.h;
        existing.parent = curNode;
      }
    }
  }

  return [];
}

export function findNearestFreeTile(
  grid: WorldGridState,
  start: TileCoord,
  boxes?: BoxEntity[]
): TileCoord {
  const clampedStart: TileCoord = {
    x: Math.max(0, Math.min(DIM_WIDTH_TILES - 1, start.x)),
    y: Math.max(0, Math.min(DIM_HEIGHT_TILES - 1, start.y)),
  };

  const activeBoxes = boxes ?? grid.boxes;
  const hasAnyFloor = grid.cells.some((col) =>
    col.some((c) => c.floorGid > 0 || c.wallOverlayGid > 0)
  );

  const isFree = (x: number, y: number, requireFloor: boolean): boolean => {
    if (isTileBlocked(grid, x, y)) return false;
    const cell = grid.cells[x][y];
    if (requireFloor && cell.floorGid === 0 && cell.wallOverlayGid === 0) {
      return false;
    }
    const hasDoor = grid.doors.some(
      (d) =>
        Math.floor(d.x / TILE_SIZE_PX) === x &&
        Math.floor(d.y / TILE_SIZE_PX) === y
    );
    if (hasDoor) return false;
    const hasBox = activeBoxes.some((b) => {
      const bt = localPixelToTile(b.x, b.y);
      return bt.x === x && bt.y === y;
    });
    return !hasBox;
  };

  for (const requireFloor of hasAnyFloor ? [true, false] : [false]) {
    const visited = new Set<number>();
    const queue: TileCoord[] = [clampedStart];
    visited.add(clampedStart.y * DIM_WIDTH_TILES + clampedStart.x);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (isFree(curr.x, curr.y, requireFloor)) {
        return curr;
      }
      for (const [dx, dy] of BFS_OFFSETS) {
        const nx = curr.x + dx;
        const ny = curr.y + dy;
        if (!isTileInBounds(nx, ny)) continue;
        const key = ny * DIM_WIDTH_TILES + nx;
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return clampedStart;
}
