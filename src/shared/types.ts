// src/shared/types.ts
// Single source of truth for data models, constants, coordinate helpers,
// and module interfaces across Core, Renderer, Networking, Audio, Input, and UI.

export const TILE_SIZE_PX = 25;
export const DIM_WIDTH_TILES = 20;
export const DIM_HEIGHT_TILES = 26;
export const DIM_WIDTH_PX = DIM_WIDTH_TILES * TILE_SIZE_PX; // 500
export const DIM_HEIGHT_PX = DIM_HEIGHT_TILES * TILE_SIZE_PX; // 650
export const FULL_VIEWPORT_WIDTH_PX = DIM_WIDTH_PX * 2; // 1000
export const FULL_VIEWPORT_HEIGHT_PX = DIM_HEIGHT_PX; // 650

export const MAX_PLAYER_SPEED = 2.0;
export const MIN_PLAYER_SPEED = 0.5;
export const SIMULATION_TICK_MS = 1000 / 60; // 16.6667ms

export type PlayerId = 1 | 2;
export type DimensionSide = 'left' | 'right';
export type WorldType = 'neutral' | 'dangerous';

export enum Direction {
  None = 0,
  Left = 1,
  UpLeft = 2,
  Up = 3,
  UpRight = 4,
  Right = 5,
  DownRight = 6,
  Down = 7,
  DownLeft = 8,
  Horizontal = 9,
  Vertical = 10,
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface TileCoord {
  x: number;
  y: number;
}

export type HealthState = 'Normal' | 'Bruised' | 'Injured' | 'Dying';

export type WeaponType = 'Broom' | 'FryingPan' | 'Plunger';
export type KeyType = 'Key' | 'BlackKey';
export type GemType = 'RedGem' | 'BlueGem' | 'GreenGem';
export type FoodType = 'Chips' | 'WaterBottle' | 'Sandwich' | 'Lollipop';
export type LightItemType = 'Flashlight' | 'Flashlight2' | 'Lantern';

export type ItemType =
  | WeaponType
  | KeyType
  | GemType
  | FoodType
  | LightItemType;

export type FlashlightMode = 'none' | 'flashlight1' | 'flashlight2' | 'lantern';

export interface ItemData {
  id: string;
  type: ItemType;
  popUpText: string;
  lollipopColor?: 'green' | 'red' | 'blue';
}

export interface AttackState {
  active: boolean;
  weapon: WeaponType | null;
  timerMs: number;
  direction: Direction;
  hasDealtKnockback: boolean;
}

export type PingKind = 'here' | 'action' | 'wait';

export interface PlayerPing {
  active: boolean;
  x: number;
  y: number;
  kind: PingKind;
  remainingMs: number;
}

export interface PlayerState {
  id: PlayerId;
  side: DimensionSide;
  /** Local pixel position within the player's dimension (0..500 x 0..650) */
  x: number;
  y: number;
  velocity: Vector2D;
  direction: Direction;
  flashLightDir: Direction;
  speed: number;
  healthState: HealthState;
  isAlive: boolean;
  isMoving: boolean;
  boxColliding: boolean;
  regenTimerMs: number;
  inventory: ItemData[];
  currentItemIndex: number;
  inventoryDisplayTimerMs: number;
  flashlightMode: FlashlightMode;
  attackState: AttackState;
  interactingObjectId: string | null;
  activePopupText: string | null;
  popupFaceDirection: Direction;
  atDoorId: string | null;
  ping: PlayerPing | null;
}

// ============================================================================
// World Entities & Room Grid State
// ============================================================================

export type DoorKind = 'Door' | 'LockedDoor' | 'PressureDoor' | 'BlackDoor' | 'FinalDoors';

export interface DoorEntity {
  id: string;
  kind: DoorKind;
  world: WorldType;
  x: number;
  y: number;
  gid: number;
  unlocked: boolean;
  playerAtDoor: boolean;
  connectedRoom: string | null;
  /** Connected door local pixel coordinates [x, y] in the destination room */
  connectedDoorPos: [number, number] | null;
  /** Optional explicit right-dimension spawn override [localX, y] for asymmetric rooms like possibleFinalRoom */
  partnerConnectedDoorPos?: [number, number] | null;
  entranceDirection: number | null;
  linkedDoorId: string | null;
  popUpText: string;
}

export interface BoxEntity {
  id: string;
  world: WorldType;
  x: number;
  y: number;
  gid: number;
  linkedBoxId: string | null;
}

export interface LampEntity {
  id: string;
  world: WorldType;
  x: number;
  y: number;
  gid: number;
  isOn: boolean;
  isBroken: boolean;
  linkedLampId: string | null;
  popUpText: string;
}

export type EvilLampStage = 'dormant' | 'opening' | 'attacking' | 'cooldown';

export interface EvilLampEntity {
  id: string;
  world: WorldType;
  x: number;
  y: number;
  gid: number;
  isOn: boolean;
  linkedLampId: string | null;
  stage: EvilLampStage;
  timerMs: number;
  popUpText: string;
}

export type PressurePlateKind = 'chest' | 'door' | 'safe';

export interface PressurePlateEntity {
  id: string;
  kind: PressurePlateKind;
  world: WorldType;
  x: number;
  y: number;
  gid: number;
  touched: boolean;
  popUpText: string;
}

export interface LeverEntity {
  id: string;
  world: WorldType;
  x: number;
  y: number;
  gid: number;
  activated: boolean;
  popUpText: string;
}

export interface ChestEntity {
  id: string;
  world: WorldType;
  x: number;
  y: number;
  gid: number;
  opened: boolean;
  used: boolean;
  popUpText: string;
}

export interface SafeEntity {
  id: string;
  world: WorldType;
  x: number;
  y: number;
  gid: number;
  opened: boolean;
  popUpText: string;
}

export interface FireEntity {
  id: string;
  world: WorldType;
  x: number;
  y: number;
  gid: number;
  variant: 1 | 2;
  isOn: boolean;
  damageTimerMs: number;
}

export interface GemStatueEntity {
  id: string;
  world: WorldType;
  x: number;
  y: number;
  gid: number;
  hasRedGem: boolean;
  hasBlueGem: boolean;
  hasGreenGem: boolean;
  blackKeySpawned: boolean;
  popUpText: string;
}

export type BookKind =
  | 'ChestBook'
  | 'SpawnBook'
  | 'StatueBook'
  | 'KeyBook'
  | 'EvillampBook'
  | 'MonsterBook'
  | 'PressureBook'
  | 'PushableBook'
  | 'WallOverlayBook'
  | 'FlashlightBook'
  | 'FoodBook'
  | 'BlackBook';

export interface BookEntity {
  id: string;
  kind: BookKind;
  world: WorldType;
  x: number;
  y: number;
  gid: number;
  popUpText: string;
}

export interface ItemEntity {
  id: string;
  world: WorldType;
  x: number;
  y: number;
  gid: number;
  item: ItemData;
}

export type BlobbyState = 'Wandering' | 'Seeking' | 'Shocking' | 'Eating';

export interface BlobbyEntity {
  id: string;
  world: WorldType;
  x: number;
  y: number;
  velocity: Vector2D;
  direction: Direction;
  state: BlobbyState;
  currentSpeed: number;
  wanderTimerTicks: number;
  wanderIntervalTicks: number;
  eatingTimerTicks: number;
  path: TileCoord[];
  nextStepIdx: number;
  nextStep: TileCoord | null;
  oldTargetCoord: TileCoord;
}

export interface DimensionTearEntity {
  id: string;
  /** Local pixel coordinates (0..475 x 0..625) */
  x: number;
  y: number;
  angle: Direction;
  stage: number; // 0..4
  growthTimerMs: number;
  hasSpread: boolean;
}

export interface RegrowthPendingTear {
  x: number;
  y: number;
  angle: Direction;
  remainingMs: number;
}

export interface GridCell {
  floorGid: number;
  wallGid: number;
  wallOverlayGid: number;
  wallDoorGid: number;
  holeGid: number;
  obstacleGids: number[];
  fakePlateGid: number;
  synthesizedGhostWall: boolean;
  collides: boolean;
  noLight: boolean;
  isHole: boolean;
  isWallDoor: boolean;
  hasSwooshTrigger: boolean;
}

export interface WorldGridState {
  world: WorldType;
  /** 20 columns (0..19) x 26 rows (0..25) */
  cells: GridCell[][];
  doors: DoorEntity[];
  boxes: BoxEntity[];
  lamps: LampEntity[];
  evilLamps: EvilLampEntity[];
  pressurePlates: PressurePlateEntity[];
  levers: LeverEntity[];
  chests: ChestEntity[];
  safes: SafeEntity[];
  fires: FireEntity[];
  statues: GemStatueEntity[];
  books: BookEntity[];
  items: ItemEntity[];
  blobbies: BlobbyEntity[];
}

export interface RoomState {
  roomName: string;
  worlds: {
    neutral: WorldGridState;
    dangerous: WorldGridState;
  };
  tears: DimensionTearEntity[];
  pendingRegrowths: RegrowthPendingTear[];
  blobbySpawnTimerMs: number;
  chestPressurePlatesToPress: number;
  chestPressurePlatesPressed: number;
  swooshTriggered: boolean;
}

// ============================================================================
// Persistence State
// ============================================================================

export interface PersistedItemRecord {
  id: string;
  world: WorldType;
  x: number;
  y: number;
  item: ItemData;
}

export interface PersistedLampRecord {
  world: WorldType;
  x: number;
  y: number;
  isOn: boolean;
}

export interface PersistedBlobbyRecord {
  world: WorldType;
  x: number;
  y: number;
}

export interface PersistedTearRecord {
  x: number;
  y: number;
  angle: Direction;
  stage: number;
}

export interface RoomPersistenceState {
  visited: boolean;
  removedItemCoords: Array<{ world: WorldType; x: number; y: number; type: ItemType }>;
  addedItems: PersistedItemRecord[];
  unlockedDoorCoords: Array<{ world: WorldType; x: number; y: number }>;
  lamps: PersistedLampRecord[];
  blobbies: PersistedBlobbyRecord[];
  tears: PersistedTearRecord[];
  chests: Record<string, { opened: boolean; used: boolean }>;
  safeOpened: boolean;
  statue: {
    hasRedGem: boolean;
    hasBlueGem: boolean;
    hasGreenGem: boolean;
    blackKeySpawned: boolean;
  };
  safePlatesPressedIds: string[];
  swooshTriggered: boolean;
}

// ============================================================================
// Game Events & Shift State
// ============================================================================

export type SoundEffectName =
  | 'blobbyTracking'
  | 'damage'
  | 'menuSelect'
  | 'inventory'
  | 'shift'
  | 'evilLampAttack'
  | 'shortAttack'
  | 'longAttack'
  | 'death'
  | 'walk'
  | 'eatingFood'
  | 'menuCycle'
  | 'fire'
  | 'doorClosing'
  | 'flashlightOnOff'
  | 'itemDrop'
  | 'itemPickup'
  | 'doorUnlocking'
  | 'doorLocking'
  | 'error'
  | 'safeOpening'
  | 'leverOff'
  | 'leverOn'
  | 'weaponSwoosh'
  | 'fryingPanHit'
  | 'heartBeat'
  | 'creaking1'
  | 'creaking2'
  | 'creaking3'
  | 'creaking4'
  | 'growl1'
  | 'growl2'
  | 'growl3'
  | 'growl4'
  | 'growl5'
  | 'bigHit'
  | 'chimes'
  | 'swoosh';

export type MusicTrackName =
  | 'start'
  | 'ambience1'
  | 'ambience2'
  | 'ambience3'
  | 'ambience4'
  | 'ambience5'
  | 'ambience6'
  | 'ambience7'
  | 'ambience8'
  | 'bigHit'
  | 'chimes'
  | 'crazyPiano'
  | 'demonBass'
  | 'demonVoice'
  | 'eerieSynth'
  | 'goblinSound'
  | 'pianoEnd'
  | 'piano'
  | 'swoosh';

export type GameEventType =
  | 'playSound'
  | 'flashScreen'
  | 'roomChanged'
  | 'dimensionShifted'
  | 'playerDamaged'
  | 'gameOver'
  | 'victory';

export interface GameEvent {
  eventId: number;
  type: GameEventType;
  sound?: SoundEffectName;
  color?: string;
  durationMs?: number;
  maxOpacity?: number;
  playerId?: PlayerId;
  side?: DimensionSide;
  world?: WorldType;
}

export interface ShiftRequestState {
  requestedBy: PlayerId | null;
  remainingMs: number;
  willHitWallForP1: boolean;
  willHitWallForP2: boolean;
}

export type PlayMode = 'local' | 'online';
export type PartnerVisibilityMode = 'strict' | 'echo';
export type ShiftMode = 'cooperative' | 'individual';
export type WindowScaleMode = 'fit' | 'integer' | 'stretch' | 'native';

export interface WindowStageLayout {
  mode: WindowScaleMode;
  baseWidth: number;
  baseHeight: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  tilePx: number;
}

export interface LobbyConfig {
  mode: PlayMode;
  partnerVisibility: PartnerVisibilityMode;
  shiftMode: ShiftMode;
  muffledCrossDimensionAudio: boolean;
}

export interface GameState {
  tick: number;
  nextEventId: number;
  rngState: number;
  roomName: string;
  roomsEntered: number;
  evilOnLeft: boolean;
  currentlyShifting: boolean;
  shiftTimerMs: number;
  shiftCooldownMs: number;
  shiftRequest: ShiftRequestState;
  convergenceDistance: number;
  safePressurePlatesPressed: number;
  isPaused: boolean;
  phase: 'playing' | 'dying' | 'gameOver' | 'victory';
  phaseTimerMs: number;
  lobbyConfig: LobbyConfig;
  room: RoomState;
  players: [PlayerState, PlayerState];
  persistence: Record<string, RoomPersistenceState>;
  events: GameEvent[];
}

// ============================================================================
// Input, Keybindings & Networking Contracts
// ============================================================================

export interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Monotonically increasing sequence counters for discrete actions */
  useItemSeq: number;
  interactSeq: number;
  inventoryCycleSeq: number;
  inventoryDropSeq: number;
  shiftRequestSeq: number;
  pingSeq: number;
  pingKind?: PingKind;
}

export interface PlayerKeyBindings {
  Up: string;
  Down: string;
  Left: string;
  Right: string;
  UseItem: string;
  Interact: string;
  Inventory: string;
  Ping: string;
}

export interface CommonKeyBindings {
  SwitchDimensions: string;
  Pause: string;
  Mute: string;
}

export interface ControlSettings {
  p1: PlayerKeyBindings;
  p2: PlayerKeyBindings;
  common: CommonKeyBindings;
}

export interface InputPacket {
  type: 'input';
  playerId: PlayerId;
  clientTick: number;
  input: PlayerInput;
}

export interface StatePacket {
  type: 'state';
  hostTick: number;
  lastProcessedClientTick: number;
  state: GameState;
}

export interface LobbySyncPacket {
  type: 'lobbySync';
  lobbyConfig: LobbyConfig;
  hostReady: boolean;
  clientReady: boolean;
  startGame: boolean;
}

export interface PingPongPacket {
  type: 'ping' | 'pong';
  timestamp: number;
}

export type NetPacket =
  | InputPacket
  | StatePacket
  | LobbySyncPacket
  | PingPongPacket;

// ============================================================================
// Module Interface Contracts (for Parallel Workstreams)
// ============================================================================

export interface IGameEngine {
  tick(dtMs: number, p1Input: PlayerInput, p2Input: PlayerInput): GameState;
  getState(): GameState;
  setState(snapshot: GameState): void;
  setLobbyConfig(config: Partial<LobbyConfig>): void;
  loadRoom(roomName: string, p1Pos?: Vector2D, p2Pos?: Vector2D): void;
  resetGame(seed?: number): void;
}

export interface RenderOptions {
  localPlayerId: PlayerId;
  mode: PlayMode;
  partnerVisibility: PartnerVisibilityMode;
  lightingEnabled: boolean;
  cameraZoom?: number;
  keyStrings?: {
    p1: PlayerKeyBindings;
    p2: PlayerKeyBindings;
    common: CommonKeyBindings;
  };
}

export interface IGameRenderer {
  render(state: GameState, options: RenderOptions, dtMs: number): void;
  triggerFlash(color: string, durationMs?: number, maxOpacity?: number): void;
  resizeForMode(mode: PlayMode): void;
}

export interface IAudioManager {
  init(): Promise<void>;
  playSound(
    name: SoundEffectName,
    options?: {
      side?: DimensionSide;
      localSide?: DimensionSide;
      mode?: PlayMode;
      muffleCrossDimension?: boolean;
    }
  ): void;
  updateAmbientAndLoops(
    state: GameState,
    localPlayerId: PlayerId,
    mode: PlayMode
  ): void;
  setSFXVolume(volume: number): void;
  getSFXVolume(): number;
  setMusicVolume(volume: number): void;
  getMusicVolume(): number;
  toggleMute(): boolean;
  isMuted(): boolean;
  stopAll(): void;
}

export interface DirectionalState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export type VirtualAction =
  | 'useItem'
  | 'interact'
  | 'inventoryTap'
  | 'inventoryDrop'
  | 'shift'
  | 'ping';

export interface IInputManager {
  getPlayerInput(playerId: PlayerId): PlayerInput;
  getSettings(): ControlSettings;
  updateBinding(
    group: 'p1' | 'p2' | 'common',
    action: string,
    code: string
  ): void;
  formatKeyLabel(code: string): string;
  setVirtualDirection?(playerId: PlayerId, dir: Partial<DirectionalState>): void;
  triggerVirtualAction?(playerId: PlayerId, action: VirtualAction): void;
  startVirtualInventoryPress?(playerId: PlayerId): void;
  endVirtualInventoryPress?(playerId: PlayerId): void;
  cancelVirtualInventoryPress?(playerId: PlayerId): void;
  triggerPause?(): void;
  triggerMute?(): void;
  destroy(): void;
}

export type ConnectionState =
  | 'disconnected'
  | 'hosting'
  | 'joining'
  | 'connected'
  | 'error';

export interface IPeerManager {
  hostRoom(customCode?: string): Promise<string>;
  joinRoom(roomCode: string): Promise<void>;
  sendPacket(packet: NetPacket): void;
  onPacket(handler: (packet: NetPacket) => void): void;
  onStateChange(handler: (state: ConnectionState, error?: string) => void): void;
  getRoomCode(): string | null;
  getConnectionState(): ConnectionState;
  getRttMs(): number;
  disconnect(): void;
}

// ============================================================================
// Pure Helper Functions
// ============================================================================

export function getWorldForSide(
  side: DimensionSide,
  evilOnLeft: boolean
): WorldType {
  if (side === 'left') {
    return evilOnLeft ? 'dangerous' : 'neutral';
  }
  return evilOnLeft ? 'neutral' : 'dangerous';
}

export function getSideForWorld(
  world: WorldType,
  evilOnLeft: boolean
): DimensionSide {
  if (world === 'neutral') {
    return evilOnLeft ? 'right' : 'left';
  }
  return evilOnLeft ? 'left' : 'right';
}

export function localPixelToTile(
  localX: number,
  localY: number,
  entityWidth: number = TILE_SIZE_PX,
  entityHeight: number = TILE_SIZE_PX
): TileCoord {
  const centerX = localX + entityWidth / 2;
  const centerY = localY + entityHeight / 2;
  const rawX = Math.floor(centerX / TILE_SIZE_PX);
  const rawY = Math.floor(centerY / TILE_SIZE_PX);
  return {
    x: Math.max(0, Math.min(DIM_WIDTH_TILES - 1, rawX)),
    y: Math.max(0, Math.min(DIM_HEIGHT_TILES - 1, rawY)),
  };
}

export function tileToLocalPixel(coord: TileCoord): Vector2D {
  return {
    x: coord.x * TILE_SIZE_PX,
    y: coord.y * TILE_SIZE_PX,
  };
}

export function tileManhattanDistance(a: TileCoord, b: TileCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function createDefaultPlayerInput(): PlayerInput {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    useItemSeq: 0,
    interactSeq: 0,
    inventoryCycleSeq: 0,
    inventoryDropSeq: 0,
    shiftRequestSeq: 0,
    pingSeq: 0,
  };
}

export function createDefaultLobbyConfig(): LobbyConfig {
  return {
    mode: 'local',
    partnerVisibility: 'strict',
    shiftMode: 'cooperative',
    muffledCrossDimensionAudio: true,
  };
}

/**
 * Deterministic Mulberry32 PRNG for reproducible simulation & P2P sync.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number = 0x5f3759df) {
    this.state = seed >>> 0;
  }

  public getState(): number {
    return this.state >>> 0;
  }

  public setState(state: number): void {
    this.state = state >>> 0;
  }

  public nextFloat(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.state = t >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(minInclusive: number, maxInclusive: number): number {
    const f = this.nextFloat();
    return Math.floor(f * (maxInclusive - minInclusive + 1)) + minInclusive;
  }
}
