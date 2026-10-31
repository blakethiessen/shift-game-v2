// src/core/gameEngine.ts
// Deterministic 60Hz simulation engine implementing IGameEngine.
// Supports both Cooperative Shift (with wall-hazard preview) and Individual Shift modes.

import { RAW_LEVELS } from './levelData';
import {
  createEmptyRoomPersistence,
  parseRoom,
} from './levelParser';
import {
  spawnInitialTearsForRoom,
  startBlobbyWandering,
  updateMonstersAndTears,
} from './monstersAndTears';
import { findNearestFreeTile } from './pathfinding';
import {
  doesBoxCollide,
  doesPlayerCollideWithWalls,
  emitEvent,
  PlayerSeqTracker,
  takeDamage,
  updateSinglePlayer,
} from './playerLogic';
import {
  openSafesInRoom,
  updateWorldObjectsAndDoors,
} from './worldObjectsLogic';
import {
  createDefaultLobbyConfig,
  DIM_HEIGHT_PX,
  DIM_WIDTH_PX,
  Direction,
  GameState,
  getWorldForSide,
  IGameEngine,
  LobbyConfig,
  localPixelToTile,
  MAX_PLAYER_SPEED,
  PlayerId,
  PlayerInput,
  PlayerState,
  RoomPersistenceState,
  SeededRandom,
  TILE_SIZE_PX,
  tileManhattanDistance,
  Vector2D,
} from '../shared/types';

function createInitialPlayerState(
  id: PlayerId,
  x: number,
  y: number
): PlayerState {
  return {
    id,
    side: id === 1 ? 'left' : 'right',
    x,
    y,
    velocity: { x: 0, y: 0 },
    direction: Direction.Down,
    flashLightDir: Direction.Down,
    speed: MAX_PLAYER_SPEED,
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
  };
}

function createInitialPersistenceMap(): Record<string, RoomPersistenceState> {
  const map: Record<string, RoomPersistenceState> = {};
  for (const roomName of Object.keys(RAW_LEVELS)) {
    map[roomName] = createEmptyRoomPersistence();
  }
  return map;
}

export class GameEngine implements IGameEngine {
  private state!: GameState;
  private rng!: SeededRandom;
  private p1Seq: PlayerSeqTracker = {
    useItemSeq: 0,
    interactSeq: 0,
    inventoryCycleSeq: 0,
    inventoryDropSeq: 0,
    pingSeq: 0,
  };
  private p2Seq: PlayerSeqTracker = {
    useItemSeq: 0,
    interactSeq: 0,
    inventoryCycleSeq: 0,
    inventoryDropSeq: 0,
    pingSeq: 0,
  };
  private lastP1ShiftSeq = 0;
  private lastP2ShiftSeq = 0;

  constructor(seed: number = 0x5f3759df) {
    this.resetGame(seed);
  }

  public resetGame(seed: number = 0x5f3759df): void {
    this.rng = new SeededRandom(seed);
    this.p1Seq = {
      useItemSeq: 0,
      interactSeq: 0,
      inventoryCycleSeq: 0,
      inventoryDropSeq: 0,
      pingSeq: 0,
    };
    this.p2Seq = {
      useItemSeq: 0,
      interactSeq: 0,
      inventoryCycleSeq: 0,
      inventoryDropSeq: 0,
      pingSeq: 0,
    };
    this.lastP1ShiftSeq = 0;
    this.lastP2ShiftSeq = 0;

    const persistence = createInitialPersistenceMap();
    const initialRoomName = 'spawnRoom';
    const room = parseRoom(
      initialRoomName,
      this.rng,
      persistence[initialRoomName]
    );
    this.saveInitialLampsToPersistence(room, persistence[initialRoomName]);

    const defaultP1X = DIM_WIDTH_PX / 2 - TILE_SIZE_PX; // 225
    const defaultP1Y = DIM_HEIGHT_PX / 2; // 325
    const defaultP2X = DIM_WIDTH_PX / 2 - TILE_SIZE_PX; // 225 (local to right dimension)
    const defaultP2Y = DIM_HEIGHT_PX / 2; // 325

    const p1 = createInitialPlayerState(1, defaultP1X, defaultP1Y);
    const p2 = createInitialPlayerState(2, defaultP2X, defaultP2Y);

    this.state = {
      tick: 0,
      nextEventId: 1,
      rngState: this.rng.getState(),
      roomName: initialRoomName,
      roomsEntered: 1,
      evilOnLeft: false,
      currentlyShifting: false,
      shiftTimerMs: 0,
      shiftCooldownMs: 0,
      shiftRequest: {
        requestedBy: null,
        remainingMs: 0,
        willHitWallForP1: false,
        willHitWallForP2: false,
      },
      convergenceDistance: tileManhattanDistance(
        localPixelToTile(p1.x, p1.y),
        localPixelToTile(p2.x, p2.y)
      ),
      safePressurePlatesPressed: 0,
      isPaused: false,
      phase: 'playing',
      phaseTimerMs: 0,
      lobbyConfig: createDefaultLobbyConfig(),
      room,
      players: [p1, p2],
      persistence,
      events: [],
    };
  }

  private saveInitialLampsToPersistence(
    room: GameState['room'],
    persist: RoomPersistenceState
  ): void {
    if (persist.lamps.length === 0) {
      persist.lamps = [
        ...room.worlds.neutral.lamps.map((l) => ({
          world: l.world,
          x: l.x,
          y: l.y,
          isOn: l.isOn,
        })),
        ...room.worlds.dangerous.lamps.map((l) => ({
          world: l.world,
          x: l.x,
          y: l.y,
          isOn: l.isOn,
        })),
        ...room.worlds.dangerous.evilLamps.map((el) => ({
          world: el.world,
          x: el.x,
          y: el.y,
          isOn: el.isOn,
        })),
      ];
    }
  }

  private saveRoomStateBeforeExit(): void {
    const persist = this.state.persistence[this.state.roomName];
    if (!persist) return;

    persist.visited = true;
    persist.swooshTriggered = this.state.room.swooshTriggered;
    persist.blobbies = [
      ...this.state.room.worlds.neutral.blobbies.map((b) => ({
        world: b.world,
        x: b.x,
        y: b.y,
      })),
      ...this.state.room.worlds.dangerous.blobbies.map((b) => ({
        world: b.world,
        x: b.x,
        y: b.y,
      })),
    ];
    persist.tears = this.state.room.tears.map((t) => ({
      x: t.x,
      y: t.y,
      angle: t.angle,
      stage: t.stage,
    }));
  }

  public loadRoom(
    roomName: string,
    p1Pos?: Vector2D,
    p2Pos?: Vector2D
  ): void {
    this.saveRoomStateBeforeExit();

    if (!this.state.persistence[roomName]) {
      this.state.persistence[roomName] = createEmptyRoomPersistence();
    }
    const persist = this.state.persistence[roomName];

    this.state.roomName = roomName;
    this.state.roomsEntered++;
    if (roomName === 'possibleFinalRoom') {
      this.state.evilOnLeft = false;
    }

    const room = parseRoom(roomName, this.rng, persist);
    this.saveInitialLampsToPersistence(room, persist);
    this.state.room = room;

    if (!persist.visited) {
      spawnInitialTearsForRoom(this.state, this.rng);
    }

    if (p1Pos) {
      this.state.players[0].x = p1Pos.x;
      this.state.players[0].y = p1Pos.y;
    }
    if (p2Pos) {
      this.state.players[1].x = p2Pos.x;
      this.state.players[1].y = p2Pos.y;
    }

    this.state.players[0].atDoorId = null;
    this.state.players[1].atDoorId = null;
    this.state.players[0].interactingObjectId = null;
    this.state.players[1].interactingObjectId = null;
    this.state.players[0].activePopupText = null;
    this.state.players[1].activePopupText = null;

    openSafesInRoom(this.state);

    emitEvent(this.state, {
      type: 'roomChanged',
    });
    emitEvent(this.state, {
      type: 'playSound',
      sound: 'doorClosing',
    });

    this.state.rngState = this.rng.getState();
  }

  public getState(): GameState {
    return this.state;
  }

  public setState(snapshot: GameState): void {
    this.state = structuredClone(snapshot);
    this.rng.setState(this.state.rngState);
  }

  public setLobbyConfig(config: Partial<LobbyConfig>): void {
    this.state.lobbyConfig = {
      ...this.state.lobbyConfig,
      ...config,
    };
  }

  private willPlayerHitWallOnShift(player: PlayerState): boolean {
    const nextWorld = getWorldForSide(player.side, !this.state.evilOnLeft);
    const nextGrid = this.state.room.worlds[nextWorld];
    return doesPlayerCollideWithWalls(nextGrid, player.x, player.y);
  }

  private executeDimensionShift(): void {
    this.state.evilOnLeft = !this.state.evilOnLeft;
    this.state.shiftRequest = {
      requestedBy: null,
      remainingMs: 0,
      willHitWallForP1: false,
      willHitWallForP2: false,
    };

    emitEvent(this.state, {
      type: 'dimensionShifted',
    });
    emitEvent(this.state, {
      type: 'playSound',
      sound: 'shift',
    });
    emitEvent(this.state, {
      type: 'flashScreen',
      color: '#FFFFFF',
      durationMs: 250,
      maxOpacity: 1.0,
    });

    // Reset all Blobbies in both worlds to Wandering
    for (const blobby of [
      ...this.state.room.worlds.neutral.blobbies,
      ...this.state.room.worlds.dangerous.blobbies,
    ]) {
      startBlobbyWandering(blobby);
    }

    // Check if any boxes are now overlapping walls/obstacles; if so, eject them
    for (const world of ['neutral', 'dangerous'] as const) {
      const grid = this.state.room.worlds[world];
      for (const box of grid.boxes) {
        if (doesBoxCollide(grid, box)) {
          const freeTile = findNearestFreeTile(
            grid,
            localPixelToTile(box.x, box.y),
            grid.boxes
          );
          box.x = freeTile.x * TILE_SIZE_PX;
          box.y = freeTile.y * TILE_SIZE_PX;
        }
      }
    }

    // Check if either player shifted into a colliding wall tile in their new world
    for (const player of this.state.players) {
      if (!player.isAlive) continue;
      const newWorld = getWorldForSide(player.side, this.state.evilOnLeft);
      const newGrid = this.state.room.worlds[newWorld];

      if (doesPlayerCollideWithWalls(newGrid, player.x, player.y)) {
        takeDamage(this.state, player.id, 0.9);

        // If player is still alive and still overlapping a wall after A* push, eject to nearest free tile
        if (
          player.isAlive &&
          doesPlayerCollideWithWalls(newGrid, player.x, player.y)
        ) {
          const freeTile = findNearestFreeTile(
            newGrid,
            localPixelToTile(player.x, player.y),
            newGrid.boxes
          );
          player.x = freeTile.x * TILE_SIZE_PX;
          player.y = freeTile.y * TILE_SIZE_PX;
        }
      }
    }
  }

  private handleShiftInput(
    dtMs: number,
    p1Input: PlayerInput,
    p2Input: PlayerInput
  ): void {
    const p1Requested = p1Input.shiftRequestSeq > this.lastP1ShiftSeq;
    const p2Requested = p2Input.shiftRequestSeq > this.lastP2ShiftSeq;
    if (p1Requested) this.lastP1ShiftSeq = p1Input.shiftRequestSeq;
    if (p2Requested) this.lastP2ShiftSeq = p2Input.shiftRequestSeq;

    if (this.state.shiftCooldownMs > 0) {
      this.state.shiftCooldownMs = Math.max(
        0,
        this.state.shiftCooldownMs - dtMs
      );
    }

    if (this.state.lobbyConfig.shiftMode === 'individual') {
      if (
        (p1Requested || p2Requested) &&
        this.state.shiftCooldownMs <= 0 &&
        !this.state.currentlyShifting
      ) {
        this.executeDimensionShift();
        this.state.shiftCooldownMs = 1000;
      }
      return;
    }

    // Cooperative Shift Mode
    if (p1Requested && p2Requested) {
      // Simultaneous shift (e.g. Local Co-op shared Shift key)
      this.executeDimensionShift();
      return;
    }

    if (p1Requested || p2Requested) {
      const requester: PlayerId = p1Requested ? 1 : 2;
      if (
        this.state.shiftRequest.requestedBy !== null &&
        this.state.shiftRequest.requestedBy !== requester &&
        this.state.shiftRequest.remainingMs > 0
      ) {
        // Partner confirmed within window!
        this.executeDimensionShift();
        return;
      }

      // Open / refresh cooperative shift request window (4000ms)
      this.state.shiftRequest = {
        requestedBy: requester,
        remainingMs: 4000,
        willHitWallForP1: this.willPlayerHitWallOnShift(this.state.players[0]),
        willHitWallForP2: this.willPlayerHitWallOnShift(this.state.players[1]),
      };
      return;
    }

    // Update active request window countdown & wall hazard warnings
    if (this.state.shiftRequest.requestedBy !== null) {
      this.state.shiftRequest.willHitWallForP1 = this.willPlayerHitWallOnShift(
        this.state.players[0]
      );
      this.state.shiftRequest.willHitWallForP2 = this.willPlayerHitWallOnShift(
        this.state.players[1]
      );
      this.state.shiftRequest.remainingMs = Math.max(
        0,
        this.state.shiftRequest.remainingMs - dtMs
      );
      if (this.state.shiftRequest.remainingMs <= 0) {
        this.state.shiftRequest = {
          requestedBy: null,
          remainingMs: 0,
          willHitWallForP1: false,
          willHitWallForP2: false,
        };
      }
    }
  }

  public tick(
    dtMs: number,
    p1Input: PlayerInput,
    p2Input: PlayerInput
  ): GameState {
    this.state.events = [];
    if (this.state.isPaused) {
      return this.state;
    }

    this.state.tick++;

    if (this.state.phase === 'dying') {
      this.state.phaseTimerMs = Math.max(0, this.state.phaseTimerMs - dtMs);
      if (this.state.phaseTimerMs <= 0) {
        this.state.phase = 'gameOver';
        emitEvent(this.state, {
          type: 'gameOver',
        });
      }
      return this.state;
    }

    if (this.state.phase !== 'playing') {
      return this.state;
    }

    // 1. Process dimension shift requests / confirmations
    this.handleShiftInput(dtMs, p1Input, p2Input);

    // 2. Update players and item interactions
    updateSinglePlayer(this.state, 0, dtMs, p1Input, this.p1Seq);
    updateSinglePlayer(this.state, 1, dtMs, p2Input, this.p2Seq);

    // 3. Update world objects, puzzles, fires, and doors
    if (this.state.phase === 'playing') {
      updateWorldObjectsAndDoors(
        this.state,
        dtMs,
        (nextRoom, p1Pos, p2Pos) => {
          this.loadRoom(nextRoom, p1Pos, p2Pos);
        }
      );
    }

    // 4. Update monsters (Blobby, EvilLamp) and DimensionTears
    if (this.state.phase === 'playing') {
      updateMonstersAndTears(this.state, dtMs, this.rng);
    }

    // 5. Update convergence distance & RNG state
    const p1Tile = localPixelToTile(
      this.state.players[0].x,
      this.state.players[0].y
    );
    const p2Tile = localPixelToTile(
      this.state.players[1].x,
      this.state.players[1].y
    );
    this.state.convergenceDistance = tileManhattanDistance(p1Tile, p2Tile);
    this.state.rngState = this.rng.getState();

    return this.state;
  }
}
