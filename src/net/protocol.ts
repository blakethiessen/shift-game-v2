// src/net/protocol.ts
// Room code generation/parsing, URL helpers, sequence-numbered input tracking,
// idempotent GameEvent deduplication, and WebRTC packet validation/serialization.

import {
  ClientPlayerSyncState,
  GameEvent,
  GameState,
  InputPacket,
  LobbyConfig,
  LobbySyncPacket,
  NetPacket,
  PingKind,
  PingPongPacket,
  PlayerId,
  PlayerInput,
  RoomPersistenceState,
  StatePacket,
  WorldGridState,
  createDefaultPlayerInput,
} from '../shared/types';
import {
  createEmptyRoomPersistence,
  formatStatuePopUpText,
  getStaticRoomCells,
  getStaticRoomTemplate,
} from '../core/levelParser';
import { RAW_LEVELS } from '../core/levelData';

export const PEER_ID_PREFIX = 'shift-game-room-';

/**
 * Unambiguous uppercase alphanumeric alphabet omitting confusing 0, O, 1, and I.
 */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const DEFAULT_ROOM_CODE_LENGTH = 5;

const SEQUENCE_KEYS = [
  'useItemSeq',
  'interactSeq',
  'inventoryCycleSeq',
  'inventoryDropSeq',
  'shiftRequestSeq',
  'pingSeq',
] as const;

type SequenceKey = (typeof SEQUENCE_KEYS)[number];

const VALID_PING_KINDS: ReadonlySet<PingKind> = new Set<PingKind>(['here', 'action', 'wait']);

/**
 * Generates an unambiguous uppercase alphanumeric room code (default 5 characters).
 */
export function generateRoomCode(
  length: number = DEFAULT_ROOM_CODE_LENGTH,
  rng: () => number = Math.random
): string {
  const safeLength = Math.max(3, Math.min(12, Math.floor(length)));
  let code = '';
  for (let i = 0; i < safeLength; i++) {
    const idx = Math.floor(rng() * ROOM_CODE_ALPHABET.length) % ROOM_CODE_ALPHABET.length;
    code += ROOM_CODE_ALPHABET[Math.max(0, idx)];
  }
  return code;
}

/**
 * Strips whitespace, `shift-game-room-` or `SHIFT-` prefixes, and non-alphanumeric
 * separators, normalizing the result to uppercase.
 */
export function normalizeRoomCode(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  let cleaned = input.trim();
  if (cleaned.toLowerCase().startsWith(PEER_ID_PREFIX)) {
    cleaned = cleaned.slice(PEER_ID_PREFIX.length);
  } else if (/^shift[-_\s]+/i.test(cleaned)) {
    cleaned = cleaned.replace(/^shift[-_\s]+/i, '');
  }
  return cleaned.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Checks whether the normalized room code is a valid 3..12 character alphanumeric code.
 */
export function isValidRoomCode(input: string): boolean {
  const normalized = normalizeRoomCode(input);
  return /^[A-Z0-9]{3,12}$/.test(normalized);
}

/**
 * Maps a room code deterministically to its PeerJS broker ID (`shift-game-room-${code.toLowerCase()}`).
 */
export function roomCodeToPeerId(roomCode: string): string {
  const normalized = normalizeRoomCode(roomCode);
  return `${PEER_ID_PREFIX}${normalized.toLowerCase()}`;
}

/**
 * Extracts the uppercase room code from a PeerJS broker ID, or returns null if invalid.
 */
export function peerIdToRoomCode(peerId: string): string | null {
  if (typeof peerId !== 'string') {
    return null;
  }
  const trimmed = peerId.trim();
  if (!trimmed.toLowerCase().startsWith(PEER_ID_PREFIX)) {
    return null;
  }
  const code = normalizeRoomCode(trimmed.slice(PEER_ID_PREFIX.length));
  return isValidRoomCode(code) ? code : null;
}

/**
 * Reads and normalizes `?room=XXXXX` from a URL query string or full URL.
 * Returns null if no valid room parameter is present.
 */
export function getRoomCodeFromUrl(searchOrUrl: string): string | null {
  if (typeof searchOrUrl !== 'string' || searchOrUrl.trim().length === 0) {
    return null;
  }
  try {
    let queryString = searchOrUrl.trim();
    if (queryString.includes('://')) {
      const parsedUrl = new URL(queryString);
      queryString = parsedUrl.search;
    } else {
      const hashIdx = queryString.indexOf('#');
      if (hashIdx !== -1) {
        queryString = queryString.slice(0, hashIdx);
      }
      const qIdx = queryString.indexOf('?');
      if (qIdx !== -1) {
        queryString = queryString.slice(qIdx);
      }
    }
    const params = new URLSearchParams(queryString);
    const rawRoom = params.get('room');
    if (!rawRoom) {
      return null;
    }
    const normalized = normalizeRoomCode(rawRoom);
    return isValidRoomCode(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

/**
 * Constructs a shareable invite URL with `?room=XXXXX` set to the normalized uppercase room code.
 */
export function buildInviteUrl(baseUrl: string, roomCode: string): string {
  const normalized = normalizeRoomCode(roomCode);
  try {
    const isAbsolute = /^https?:\/\//i.test(baseUrl.trim());
    const url = isAbsolute
      ? new URL(baseUrl.trim())
      : new URL(baseUrl.trim() || '/', 'http://localhost');
    url.searchParams.set('room', normalized);
    if (isAbsolute) {
      return url.toString();
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}room=${encodeURIComponent(normalized)}`;
  }
}

/**
 * Buffers and merges sequence-numbered `InputPacket`s from a remote player for the Host's
 * 60Hz `GameEngine.tick()` loop:
 * - Held directional keys (`up`, `down`, `left`, `right`) reflect the newest `clientTick`.
 * - Discrete action sequence counters (`useItemSeq`, `interactSeq`, `inventoryCycleSeq`,
 *   `inventoryDropSeq`, `shiftRequestSeq`, `pingSeq`) step monotonically by at most +1 per
 *   Host tick toward the highest received sequence number so clumped packets never drop
 *   1-frame pulses and sub-60Hz packet intervals never double-fire actions.
 */
export class InputSequenceTracker {
  private lastClientTick = 0;
  private up = false;
  private down = false;
  private left = false;
  private right = false;

  private targetSeq: Record<SequenceKey, number> = {
    useItemSeq: 0,
    interactSeq: 0,
    inventoryCycleSeq: 0,
    inventoryDropSeq: 0,
    shiftRequestSeq: 0,
    pingSeq: 0,
  };

  private deliveredSeq: Record<SequenceKey, number> = {
    useItemSeq: 0,
    interactSeq: 0,
    inventoryCycleSeq: 0,
    inventoryDropSeq: 0,
    shiftRequestSeq: 0,
    pingSeq: 0,
  };

  private pingKindBySeq = new Map<number, PingKind>();
  private lastPingKind: PingKind | undefined = undefined;

  public receivePacket(packet: InputPacket): void {
    this.pushInput(packet.input, packet.clientTick);
  }

  public pushInput(input: PlayerInput, clientTick?: number): void {
    const effectiveTick =
      typeof clientTick === 'number' && Number.isFinite(clientTick)
        ? clientTick
        : this.lastClientTick + 1;

    if (effectiveTick >= this.lastClientTick) {
      this.lastClientTick = effectiveTick;
      this.up = Boolean(input.up);
      this.down = Boolean(input.down);
      this.left = Boolean(input.left);
      this.right = Boolean(input.right);
    }

    const prevTargetPingSeq = this.targetSeq.pingSeq;
    for (const key of SEQUENCE_KEYS) {
      const incomingVal = input[key];
      if (typeof incomingVal === 'number' && Number.isFinite(incomingVal) && incomingVal >= 0) {
        const floored = Math.floor(incomingVal);
        if (floored > this.targetSeq[key]) {
          this.targetSeq[key] = floored;
        }
      }
    }

    if (input.pingKind && VALID_PING_KINDS.has(input.pingKind)) {
      this.lastPingKind = input.pingKind;
      const newTargetPingSeq = this.targetSeq.pingSeq;
      for (let seq = prevTargetPingSeq + 1; seq <= newTargetPingSeq; seq++) {
        if (!this.pingKindBySeq.has(seq)) {
          this.pingKindBySeq.set(seq, input.pingKind);
        }
      }
    }
  }

  public consumeForTick(): PlayerInput {
    const prevPingSeq = this.deliveredSeq.pingSeq;
    for (const key of SEQUENCE_KEYS) {
      if (this.deliveredSeq[key] < this.targetSeq[key]) {
        this.deliveredSeq[key] += 1;
      }
    }

    let pingKind: PingKind | undefined;
    if (this.deliveredSeq.pingSeq > prevPingSeq) {
      pingKind = this.pingKindBySeq.get(this.deliveredSeq.pingSeq) ?? this.lastPingKind;
      this.pingKindBySeq.delete(this.deliveredSeq.pingSeq);
    } else if (this.lastPingKind !== undefined) {
      pingKind = this.lastPingKind;
    }

    const snapshot: PlayerInput = {
      up: this.up,
      down: this.down,
      left: this.left,
      right: this.right,
      useItemSeq: this.deliveredSeq.useItemSeq,
      interactSeq: this.deliveredSeq.interactSeq,
      inventoryCycleSeq: this.deliveredSeq.inventoryCycleSeq,
      inventoryDropSeq: this.deliveredSeq.inventoryDropSeq,
      shiftRequestSeq: this.deliveredSeq.shiftRequestSeq,
      pingSeq: this.deliveredSeq.pingSeq,
    };

    if (pingKind !== undefined) {
      snapshot.pingKind = pingKind;
    }

    return snapshot;
  }

  public hasPendingActions(): boolean {
    for (const key of SEQUENCE_KEYS) {
      if (this.deliveredSeq[key] < this.targetSeq[key]) {
        return true;
      }
    }
    return false;
  }

  public getLastClientTick(): number {
    return this.lastClientTick;
  }

  public getDeliveredInput(): PlayerInput {
    const snapshot: PlayerInput = {
      up: this.up,
      down: this.down,
      left: this.left,
      right: this.right,
      useItemSeq: this.deliveredSeq.useItemSeq,
      interactSeq: this.deliveredSeq.interactSeq,
      inventoryCycleSeq: this.deliveredSeq.inventoryCycleSeq,
      inventoryDropSeq: this.deliveredSeq.inventoryDropSeq,
      shiftRequestSeq: this.deliveredSeq.shiftRequestSeq,
      pingSeq: this.deliveredSeq.pingSeq,
    };
    if (this.lastPingKind !== undefined) {
      snapshot.pingKind = this.lastPingKind;
    }
    return snapshot;
  }

  public reset(): void {
    const defaults = createDefaultPlayerInput();
    this.lastClientTick = 0;
    this.up = defaults.up;
    this.down = defaults.down;
    this.left = defaults.left;
    this.right = defaults.right;
    for (const key of SEQUENCE_KEYS) {
      this.targetSeq[key] = 0;
      this.deliveredSeq[key] = 0;
    }
    this.pingKindBySeq.clear();
    this.lastPingKind = undefined;
  }
}

/**
 * Idempotent filter for `GameEvent`s received in authoritative `StatePacket` snapshots.
 * Tracks `lastProcessedEventId` so each event (`playSound`, `flashScreen`, etc.) is
 * consumed exactly once on the Client.
 */
export class EventDeduplicator {
  private lastProcessedEventId: number;

  constructor(initialLastEventId: number = 0) {
    this.lastProcessedEventId = Math.max(0, Math.floor(initialLastEventId));
  }

  public filterNewEvents(events: readonly GameEvent[]): GameEvent[] {
    if (!Array.isArray(events) || events.length === 0) {
      return [];
    }

    const unseen = events
      .filter(
        (ev): ev is GameEvent =>
          Boolean(ev) &&
          typeof ev.eventId === 'number' &&
          Number.isFinite(ev.eventId) &&
          ev.eventId > this.lastProcessedEventId
      )
      .slice()
      .sort((a, b) => a.eventId - b.eventId);

    const deduplicated: GameEvent[] = [];
    for (const ev of unseen) {
      if (ev.eventId > this.lastProcessedEventId) {
        this.lastProcessedEventId = ev.eventId;
        deduplicated.push(ev);
      }
    }

    return deduplicated;
  }

  public extractNewEvents(events: readonly GameEvent[]): GameEvent[] {
    return this.filterNewEvents(events);
  }

  public extractFromState(state: Pick<GameState, 'events'>): GameEvent[] {
    return this.filterNewEvents(state.events);
  }

  public getLastProcessedEventId(): number {
    return this.lastProcessedEventId;
  }

  public reset(lastEventId: number = 0): void {
    this.lastProcessedEventId = Math.max(0, Math.floor(lastEventId));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isValidPlayerInput(value: unknown): value is PlayerInput {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value.up !== 'boolean' ||
    typeof value.down !== 'boolean' ||
    typeof value.left !== 'boolean' ||
    typeof value.right !== 'boolean'
  ) {
    return false;
  }
  for (const key of SEQUENCE_KEYS) {
    if (!isNonNegativeNumber(value[key])) {
      return false;
    }
  }
  if (
    value.pingKind !== undefined &&
    (typeof value.pingKind !== 'string' || !VALID_PING_KINDS.has(value.pingKind as PingKind))
  ) {
    return false;
  }
  return true;
}

export function isValidLobbyConfig(value: unknown): value is LobbyConfig {
  if (!isRecord(value)) {
    return false;
  }
  const validMode = value.mode === 'local' || value.mode === 'online';
  const validVis = value.partnerVisibility === 'strict' || value.partnerVisibility === 'echo';
  const validShift = value.shiftMode === 'cooperative' || value.shiftMode === 'individual';
  const validAudio = typeof value.muffledCrossDimensionAudio === 'boolean';
  const validTesting =
    value.testingMode === undefined || typeof value.testingMode === 'boolean';
  return validMode && validVis && validShift && validAudio && validTesting;
}

export function isValidClientPlayerSyncState(
  value: unknown
): value is ClientPlayerSyncState {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value.roomName !== 'string' ||
    !isNonNegativeNumber(value.roomsEntered) ||
    typeof value.evilOnLeft !== 'boolean' ||
    !isNonNegativeNumber(value.ackHostTick) ||
    typeof value.x !== 'number' ||
    !Number.isFinite(value.x) ||
    typeof value.y !== 'number' ||
    !Number.isFinite(value.y) ||
    !isRecord(value.velocity) ||
    typeof value.velocity.x !== 'number' ||
    !Number.isFinite(value.velocity.x) ||
    typeof value.velocity.y !== 'number' ||
    !Number.isFinite(value.velocity.y) ||
    typeof value.direction !== 'number' ||
    !Number.isFinite(value.direction) ||
    typeof value.flashLightDir !== 'number' ||
    !Number.isFinite(value.flashLightDir) ||
    typeof value.isMoving !== 'boolean' ||
    typeof value.boxColliding !== 'boolean'
  ) {
    return false;
  }
  return true;
}

export function isValidNetPacket(value: unknown): value is NetPacket {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'input': {
      const validPlayerId = value.playerId === 1 || value.playerId === 2;
      const validClientState =
        value.clientState === undefined ||
        isValidClientPlayerSyncState(value.clientState);
      return (
        validPlayerId &&
        isNonNegativeNumber(value.clientTick) &&
        isValidPlayerInput(value.input) &&
        validClientState
      );
    }
    case 'state': {
      if (
        !isNonNegativeNumber(value.hostTick) ||
        !isNonNegativeNumber(value.lastProcessedClientTick) ||
        !isRecord(value.state)
      ) {
        return false;
      }
      const st = value.state;
      return (
        isNonNegativeNumber(st.tick) &&
        typeof st.roomName === 'string' &&
        Array.isArray(st.players) &&
        st.players.length === 2 &&
        isRecord(st.room) &&
        Array.isArray(st.events)
      );
    }
    case 'lobbySync': {
      return (
        isValidLobbyConfig(value.lobbyConfig) &&
        typeof value.hostReady === 'boolean' &&
        typeof value.clientReady === 'boolean' &&
        typeof value.startGame === 'boolean'
      );
    }
    case 'ping':
    case 'pong': {
      return typeof value.timestamp === 'number' && Number.isFinite(value.timestamp);
    }
    default:
      return false;
  }
}

function isModifiedRoomPersistence(p: RoomPersistenceState | undefined): boolean {
  if (!p) return false;
  return (
    p.visited ||
    p.removedItemCoords.length > 0 ||
    p.addedItems.length > 0 ||
    p.unlockedDoorCoords.length > 0 ||
    p.lamps.length > 0 ||
    p.blobbies.length > 0 ||
    p.tears.length > 0 ||
    Object.keys(p.chests).length > 0 ||
    p.safeOpened ||
    p.statue.hasRedGem ||
    p.statue.hasBlueGem ||
    p.statue.hasGreenGem ||
    p.statue.blackKeySpawned ||
    p.safePlatesPressedIds.length > 0 ||
    p.swooshTriggered
  );
}

function compactWorldGridForWire(
  world: WorldGridState,
  templateWorld: WorldGridState
): Record<string, unknown> {
  const canCompactBoxes =
    world.boxes.length === templateWorld.boxes.length &&
    world.boxes.every(
      (b, i) =>
        b.id === templateWorld.boxes[i].id &&
        b.gid === templateWorld.boxes[i].gid &&
        b.linkedBoxId === templateWorld.boxes[i].linkedBoxId
    );

  const compactedItems = world.items.map((it) => {
    const tmplIdx = templateWorld.items.findIndex(
      (t) =>
        t.id === it.id &&
        t.x === it.x &&
        t.y === it.y &&
        t.gid === it.gid &&
        t.item.id === it.item.id &&
        t.item.type === it.item.type &&
        t.item.popUpText === it.item.popUpText &&
        t.item.lollipopColor === it.item.lollipopColor
    );
    return tmplIdx !== -1 ? tmplIdx : it;
  });

  return {
    ...world,
    cells: [],
    books:
      world.books.length === templateWorld.books.length ? [] : world.books,
    boxes: canCompactBoxes
      ? world.boxes.map((b) => [b.x, b.y])
      : world.boxes,
    items: compactedItems,
    doors:
      world.doors.length === templateWorld.doors.length &&
      world.doors.every((d, i) => d.id === templateWorld.doors[i].id)
        ? world.doors.map((d) => [d.unlocked ? 1 : 0, d.playerAtDoor ? 1 : 0])
        : world.doors.map((d) => ({
            id: d.id,
            unlocked: d.unlocked,
            playerAtDoor: d.playerAtDoor,
          })),
    lamps:
      world.lamps.length === templateWorld.lamps.length &&
      world.lamps.every((l, i) => l.id === templateWorld.lamps[i].id)
        ? world.lamps.map((l) => (l.isOn ? 1 : 0))
        : world.lamps.map((l) => ({
            id: l.id,
            isOn: l.isOn,
          })),
    evilLamps:
      world.evilLamps.length === templateWorld.evilLamps.length &&
      world.evilLamps.every((el, i) => el.id === templateWorld.evilLamps[i].id)
        ? world.evilLamps.map((el) => [el.isOn ? 1 : 0, el.stage, el.timerMs])
        : world.evilLamps.map((el) => ({
            id: el.id,
            isOn: el.isOn,
            stage: el.stage,
            timerMs: el.timerMs,
          })),
    pressurePlates:
      world.pressurePlates.length === templateWorld.pressurePlates.length &&
      world.pressurePlates.every(
        (p, i) => p.id === templateWorld.pressurePlates[i].id
      )
        ? world.pressurePlates.map((p) => (p.touched ? 1 : 0))
        : world.pressurePlates.map((p) => ({
            id: p.id,
            touched: p.touched,
          })),
    levers:
      world.levers.length === templateWorld.levers.length &&
      world.levers.every((lv, i) => lv.id === templateWorld.levers[i].id)
        ? world.levers.map((lv) => (lv.activated ? 1 : 0))
        : world.levers.map((lv) => ({
            id: lv.id,
            activated: lv.activated,
          })),
    chests:
      world.chests.length === templateWorld.chests.length &&
      world.chests.every((c, i) => c.id === templateWorld.chests[i].id)
        ? world.chests.map((c) => [c.opened ? 1 : 0, c.used ? 1 : 0])
        : world.chests.map((c) => ({
            id: c.id,
            opened: c.opened,
            used: c.used,
          })),
    safes:
      world.safes.length === templateWorld.safes.length &&
      world.safes.every((s, i) => s.id === templateWorld.safes[i].id)
        ? world.safes.map((s) => (s.opened ? 1 : 0))
        : world.safes.map((s) => ({
            id: s.id,
            opened: s.opened,
          })),
    fires:
      world.fires.length === templateWorld.fires.length &&
      world.fires.every((f, i) => f.id === templateWorld.fires[i].id)
        ? world.fires.map((f) => [f.isOn ? 1 : 0, f.damageTimerMs])
        : world.fires.map((f) => ({
            id: f.id,
            isOn: f.isOn,
            damageTimerMs: f.damageTimerMs,
          })),
    statues:
      world.statues.length === templateWorld.statues.length &&
      world.statues.every((s, i) => s.id === templateWorld.statues[i].id)
        ? world.statues.map((stObj) => [
            stObj.hasRedGem ? 1 : 0,
            stObj.hasBlueGem ? 1 : 0,
            stObj.hasGreenGem ? 1 : 0,
            stObj.blackKeySpawned ? 1 : 0,
          ])
        : world.statues.map((stObj) => ({
            id: stObj.id,
            hasRedGem: stObj.hasRedGem,
            hasBlueGem: stObj.hasBlueGem,
            hasGreenGem: stObj.hasGreenGem,
            blackKeySpawned: stObj.blackKeySpawned,
          })),
  };
}

function restoreCompactedWorldGrid(
  world: WorldGridState,
  templateWorld: WorldGridState,
  staticCells: WorldGridState['cells']
): void {
  world.cells = staticCells;

  if (
    Array.isArray(world.books) &&
    world.books.length === 0 &&
    templateWorld.books.length > 0
  ) {
    world.books = templateWorld.books.map((b) => ({ ...b }));
  }

  if (
    Array.isArray(world.boxes) &&
    world.boxes.length === templateWorld.boxes.length &&
    world.boxes.every((b) => Array.isArray(b))
  ) {
    world.boxes = world.boxes.map((pair, i) => {
      const coords = pair as unknown as [number, number];
      const tmpl = templateWorld.boxes[i];
      return {
        ...tmpl,
        x: coords[0],
        y: coords[1],
      };
    });
  }

  if (Array.isArray(world.items)) {
    world.items = world.items.map((entry) => {
      if (typeof entry === 'number' && templateWorld.items[entry]) {
        const tmpl = templateWorld.items[entry];
        return {
          ...tmpl,
          item: { ...tmpl.item },
        };
      }
      return entry;
    });
  }

  if (Array.isArray(world.doors)) {
    world.doors = world.doors.map((d, i) => {
      const isTuple = Array.isArray(d);
      const tmpl = isTuple
        ? templateWorld.doors[i]
        : templateWorld.doors.find((t) => t.id === d.id);
      if (!tmpl) return d;
      const unlocked = isTuple
        ? Boolean((d as unknown as [number, number])[0])
        : Boolean(d.unlocked);
      const playerAtDoor = isTuple
        ? Boolean((d as unknown as [number, number])[1])
        : Boolean(d.playerAtDoor);
      const popUpText =
        unlocked && (tmpl.kind === 'LockedDoor' || tmpl.kind === 'BlackDoor')
          ? tmpl.kind === 'BlackDoor'
            ? 'The black door is unlocked!'
            : 'The door is unlocked!'
          : tmpl.popUpText;
      return {
        ...tmpl,
        connectedDoorPos: tmpl.connectedDoorPos
          ? [...tmpl.connectedDoorPos]
          : null,
        partnerConnectedDoorPos: tmpl.partnerConnectedDoorPos
          ? [...tmpl.partnerConnectedDoorPos]
          : null,
        unlocked,
        playerAtDoor,
        popUpText,
      };
    });
  }

  if (Array.isArray(world.lamps)) {
    world.lamps = world.lamps.map((l, i) => {
      const isNumber = typeof l === 'number' || typeof l === 'boolean';
      const tmpl = isNumber
        ? templateWorld.lamps[i]
        : templateWorld.lamps.find((t) => t.id === l.id);
      if (!tmpl) return l;
      return {
        ...tmpl,
        isOn: isNumber ? Boolean(l) : Boolean(l.isOn),
      };
    });
  }

  if (Array.isArray(world.evilLamps)) {
    world.evilLamps = world.evilLamps.map((el, i) => {
      const isTuple = Array.isArray(el);
      const tmpl = isTuple
        ? templateWorld.evilLamps[i]
        : templateWorld.evilLamps.find((t) => t.id === el.id);
      if (!tmpl) return el;
      if (isTuple) {
        const tuple = el as unknown as [number, typeof tmpl.stage, number];
        return {
          ...tmpl,
          isOn: Boolean(tuple[0]),
          stage: tuple[1] ?? tmpl.stage,
          timerMs: typeof tuple[2] === 'number' ? tuple[2] : tmpl.timerMs,
        };
      }
      return {
        ...tmpl,
        isOn: Boolean(el.isOn),
        stage: el.stage ?? tmpl.stage,
        timerMs: typeof el.timerMs === 'number' ? el.timerMs : tmpl.timerMs,
      };
    });
  }

  if (Array.isArray(world.pressurePlates)) {
    world.pressurePlates = world.pressurePlates.map((p, i) => {
      const isScalar = typeof p === 'number' || typeof p === 'boolean';
      const tmpl = isScalar
        ? templateWorld.pressurePlates[i]
        : templateWorld.pressurePlates.find((t) => t.id === p.id);
      if (!tmpl) return p;
      return {
        ...tmpl,
        touched: isScalar ? Boolean(p) : Boolean(p.touched),
      };
    });
  }

  if (Array.isArray(world.levers)) {
    world.levers = world.levers.map((lv, i) => {
      const isScalar = typeof lv === 'number' || typeof lv === 'boolean';
      const tmpl = isScalar
        ? templateWorld.levers[i]
        : templateWorld.levers.find((t) => t.id === lv.id);
      if (!tmpl) return lv;
      return {
        ...tmpl,
        activated: isScalar ? Boolean(lv) : Boolean(lv.activated),
      };
    });
  }

  if (Array.isArray(world.chests)) {
    world.chests = world.chests.map((c, i) => {
      const isTuple = Array.isArray(c);
      const tmpl = isTuple
        ? templateWorld.chests[i]
        : templateWorld.chests.find((t) => t.id === c.id);
      if (!tmpl) return c;
      if (isTuple) {
        const tuple = c as unknown as [number, number];
        return {
          ...tmpl,
          opened: Boolean(tuple[0]),
          used: Boolean(tuple[1]),
        };
      }
      return {
        ...tmpl,
        opened: Boolean(c.opened),
        used: Boolean(c.used),
      };
    });
  }

  if (Array.isArray(world.safes)) {
    world.safes = world.safes.map((s, i) => {
      const isScalar = typeof s === 'number' || typeof s === 'boolean';
      const tmpl = isScalar
        ? templateWorld.safes[i]
        : templateWorld.safes.find((t) => t.id === s.id);
      if (!tmpl) return s;
      return {
        ...tmpl,
        opened: isScalar ? Boolean(s) : Boolean(s.opened),
      };
    });
  }

  if (Array.isArray(world.fires)) {
    world.fires = world.fires.map((f, i) => {
      const isTuple = Array.isArray(f);
      const tmpl = isTuple
        ? templateWorld.fires[i]
        : templateWorld.fires.find((t) => t.id === f.id);
      if (!tmpl) return f;
      if (isTuple) {
        const tuple = f as unknown as [number, number];
        return {
          ...tmpl,
          isOn: Boolean(tuple[0]),
          damageTimerMs:
            typeof tuple[1] === 'number' ? tuple[1] : tmpl.damageTimerMs,
        };
      }
      return {
        ...tmpl,
        isOn: Boolean(f.isOn),
        damageTimerMs:
          typeof f.damageTimerMs === 'number'
            ? f.damageTimerMs
            : tmpl.damageTimerMs,
      };
    });
  }

  if (Array.isArray(world.statues)) {
    world.statues = world.statues.map((stObj, i) => {
      const isTuple = Array.isArray(stObj);
      const tmpl = isTuple
        ? templateWorld.statues[i]
        : templateWorld.statues.find((t) => t.id === stObj.id);
      if (!tmpl) return stObj;
      const merged = isTuple
        ? {
            ...tmpl,
            hasRedGem: Boolean((stObj as unknown as number[])[0]),
            hasBlueGem: Boolean((stObj as unknown as number[])[1]),
            hasGreenGem: Boolean((stObj as unknown as number[])[2]),
            blackKeySpawned: Boolean((stObj as unknown as number[])[3]),
          }
        : {
            ...tmpl,
            hasRedGem: Boolean(stObj.hasRedGem),
            hasBlueGem: Boolean(stObj.hasBlueGem),
            hasGreenGem: Boolean(stObj.hasGreenGem),
            blackKeySpawned: Boolean(stObj.blackKeySpawned),
          };
      return {
        ...merged,
        popUpText: formatStatuePopUpText(merged),
      };
    });
  }
}

function compactPersistenceForWire(
  persistence: Record<string, RoomPersistenceState> | undefined
): Record<string, unknown> {
  const compactPersistence: Record<string, unknown> = {};
  if (!persistence || typeof persistence !== 'object') {
    return compactPersistence;
  }
  for (const [roomKey, record] of Object.entries(persistence)) {
    if (!isModifiedRoomPersistence(record)) {
      continue;
    }
    const tmpl = getStaticRoomTemplate(roomKey);
    if (tmpl && record.lamps.length > 0) {
      const tmplLamps = [
        ...tmpl.worlds.neutral.lamps,
        ...tmpl.worlds.dangerous.lamps,
        ...tmpl.worlds.dangerous.evilLamps,
      ];
      if (
        record.lamps.length === tmplLamps.length &&
        record.lamps.every(
          (l, i) =>
            l.world === tmplLamps[i].world &&
            l.x === tmplLamps[i].x &&
            l.y === tmplLamps[i].y
        )
      ) {
        compactPersistence[roomKey] = {
          ...record,
          lamps: record.lamps.map((l) => (l.isOn ? 1 : 0)),
        };
        continue;
      }
    }
    compactPersistence[roomKey] = record;
  }
  return compactPersistence;
}

function restoreCompactedPersistenceRecord(
  roomKey: string,
  record: RoomPersistenceState
): RoomPersistenceState {
  if (
    Array.isArray(record.lamps) &&
    record.lamps.length > 0 &&
    typeof record.lamps[0] === 'number'
  ) {
    const tmpl = getStaticRoomTemplate(roomKey);
    if (tmpl) {
      const tmplLamps = [
        ...tmpl.worlds.neutral.lamps,
        ...tmpl.worlds.dangerous.lamps,
        ...tmpl.worlds.dangerous.evilLamps,
      ];
      if (record.lamps.length === tmplLamps.length) {
        return {
          ...record,
          lamps: tmplLamps.map((tl, i) => ({
            world: tl.world,
            x: tl.x,
            y: tl.y,
            isOn: Boolean((record.lamps as unknown as number[])[i]),
          })),
        };
      }
    }
  }
  return record;
}

/**
 * Serializes a validated NetPacket into a JSON string for WebRTC/Relay transmission.
 * For `state` packets, strips the static 20x26 `GridCell` matrices (`neutral.cells` and
 * `dangerous.cells`), static room entity metadata, and unvisited empty `persistence`
 * entries when `roomName` is in `RAW_LEVELS`, reducing wire payload size from ~272KB
 * to ~2.5KB (fitting inside a single unchunked frame).
 */
export function serializePacket(packet: NetPacket): string {
  if (packet.type === 'state') {
    const st = packet.state;
    const neutralCells = st?.room?.worlds?.neutral?.cells;
    const dangerousCells = st?.room?.worlds?.dangerous?.cells;
    const template = getStaticRoomTemplate(st?.roomName);
    if (
      Array.isArray(neutralCells) &&
      neutralCells.length > 0 &&
      Array.isArray(dangerousCells) &&
      dangerousCells.length > 0 &&
      template !== null
    ) {
      const compactPersistence = compactPersistenceForWire(st.persistence);
      return JSON.stringify({
        ...packet,
        _cellsCompacted: true,
        state: {
          ...st,
          persistence: compactPersistence,
          room: {
            ...st.room,
            worlds: {
              neutral: compactWorldGridForWire(
                st.room.worlds.neutral,
                template.worlds.neutral
              ),
              dangerous: compactWorldGridForWire(
                st.room.worlds.dangerous,
                template.worlds.dangerous
              ),
            },
          },
        },
      });
    }
  }
  return JSON.stringify(packet);
}

/**
 * Safely parses and validates an incoming WebRTC DataChannel payload into a NetPacket.
 * Supports JSON strings, ArrayBuffers/Uint8Arrays, or pre-parsed objects.
 */
export function deserializePacket(raw: unknown): NetPacket | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  let parsed: unknown = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  } else if (raw instanceof ArrayBuffer) {
    try {
      const text = new TextDecoder().decode(new Uint8Array(raw));
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
  } else if (ArrayBuffer.isView(raw)) {
    try {
      const view = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
      const text = new TextDecoder().decode(view);
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
  }

  if (!isValidNetPacket(parsed)) {
    return null;
  }

  if (
    parsed.type === 'state' &&
    (parsed as unknown as { _cellsCompacted?: unknown })._cellsCompacted === true
  ) {
    delete (parsed as unknown as { _cellsCompacted?: unknown })._cellsCompacted;
    const staticCells = getStaticRoomCells(parsed.state.roomName);
    const template = getStaticRoomTemplate(parsed.state.roomName);
    if (staticCells && template && parsed.state.room?.worlds) {
      if (parsed.state.room.worlds.neutral) {
        restoreCompactedWorldGrid(
          parsed.state.room.worlds.neutral,
          template.worlds.neutral,
          staticCells.neutral
        );
      }
      if (parsed.state.room.worlds.dangerous) {
        restoreCompactedWorldGrid(
          parsed.state.room.worlds.dangerous,
          template.worlds.dangerous,
          staticCells.dangerous
        );
      }
    }
    const fullPersistence: Record<string, RoomPersistenceState> = {};
    for (const roomKey of Object.keys(RAW_LEVELS)) {
      const rawRecord = parsed.state.persistence?.[roomKey];
      fullPersistence[roomKey] = rawRecord
        ? restoreCompactedPersistenceRecord(roomKey, rawRecord)
        : createEmptyRoomPersistence();
    }
    if (parsed.state.persistence) {
      for (const [k, v] of Object.entries(parsed.state.persistence)) {
        fullPersistence[k] = restoreCompactedPersistenceRecord(k, v);
      }
    }
    parsed.state.persistence = fullPersistence;
  }

  return parsed as InputPacket | StatePacket | LobbySyncPacket | PingPongPacket;
}

interface InterpolatedTransform {
  displayX: number;
  displayY: number;
  targetX: number;
  targetY: number;
}

const TELEPORT_SNAP_THRESHOLD_PX = 50;
const INTERPOLATION_TIME_CONSTANT_MS = 45;

/**
 * Smoothly interpolates remote entity transforms (`Player 1` on Client, `Player 2` on Host,
 * `Blobby` monsters, and partner-pushed `Box` entities) across 60 FPS render frames
 * without mutating `GameEngine`'s underlying simulation state.
 */
export class EntityInterpolator {
  private roomName = '';
  private roomsEntered = -1;
  private entries = new Map<string, InterpolatedTransform>();

  public reset(): void {
    this.roomName = '';
    this.roomsEntered = -1;
    this.entries.clear();
  }

  private upsertEntry(key: string, targetX: number, targetY: number): void {
    const existing = this.entries.get(key);
    if (
      !existing ||
      Math.hypot(targetX - existing.displayX, targetY - existing.displayY) >
        TELEPORT_SNAP_THRESHOLD_PX
    ) {
      this.entries.set(key, {
        displayX: targetX,
        displayY: targetY,
        targetX,
        targetY,
      });
    } else {
      existing.targetX = targetX;
      existing.targetY = targetY;
    }
  }

  public recordSnapshot(state: GameState, localPlayerId: PlayerId): void {
    if (
      state.roomName !== this.roomName ||
      state.roomsEntered !== this.roomsEntered
    ) {
      this.roomName = state.roomName;
      this.roomsEntered = state.roomsEntered;
      this.entries.clear();
    }

    const remotePlayerIndex = localPlayerId === 1 ? 1 : 0;
    const remotePlayer = state.players[remotePlayerIndex];
    if (remotePlayer) {
      this.upsertEntry(
        `player_${remotePlayer.id}`,
        remotePlayer.x,
        remotePlayer.y
      );
    }

    if (localPlayerId === 2 && state.room?.worlds) {
      const seenBlobbies = new Set<string>();
      for (const b of [
        ...(state.room.worlds.neutral?.blobbies ?? []),
        ...(state.room.worlds.dangerous?.blobbies ?? []),
      ]) {
        const key = `blobby_${b.id}`;
        seenBlobbies.add(key);
        this.upsertEntry(key, b.x, b.y);
      }
      for (const key of this.entries.keys()) {
        if (key.startsWith('blobby_') && !seenBlobbies.has(key)) {
          this.entries.delete(key);
        }
      }
    }
  }

  public recordRemotePlayerSync(
    playerId: PlayerId,
    sync: ClientPlayerSyncState
  ): void {
    if (
      sync.roomName !== this.roomName ||
      sync.roomsEntered !== this.roomsEntered
    ) {
      this.roomName = sync.roomName;
      this.roomsEntered = sync.roomsEntered;
      this.entries.clear();
    }
    this.upsertEntry(`player_${playerId}`, sync.x, sync.y);
  }

  public applyToStateForRender(
    state: GameState,
    localPlayerId: PlayerId,
    dtMs: number
  ): () => void {
    if (
      state.roomName !== this.roomName ||
      state.roomsEntered !== this.roomsEntered ||
      this.entries.size === 0
    ) {
      return () => {};
    }

    const safeDt = Math.max(0, Math.min(dtMs, 100));
    const alpha =
      safeDt > 0
        ? 1 - Math.exp(-safeDt / INTERPOLATION_TIME_CONSTANT_MS)
        : 0.35;

    const saved: Array<{
      entity: { x: number; y: number };
      x: number;
      y: number;
    }> = [];

    const stepAndSwap = (key: string, entity: { x: number; y: number }) => {
      const entry = this.entries.get(key);
      if (!entry) return;
      const dx = entry.targetX - entry.displayX;
      const dy = entry.targetY - entry.displayY;
      if (Math.hypot(dx, dy) > TELEPORT_SNAP_THRESHOLD_PX) {
        entry.displayX = entry.targetX;
        entry.displayY = entry.targetY;
      } else {
        entry.displayX =
          Math.abs(dx) < 0.05 ? entry.targetX : entry.displayX + dx * alpha;
        entry.displayY =
          Math.abs(dy) < 0.05 ? entry.targetY : entry.displayY + dy * alpha;
      }
      saved.push({ entity, x: entity.x, y: entity.y });
      entity.x = entry.displayX;
      entity.y = entry.displayY;
    };

    const remotePlayerIndex = localPlayerId === 1 ? 1 : 0;
    const remotePlayer = state.players[remotePlayerIndex];
    if (remotePlayer) {
      stepAndSwap(`player_${remotePlayer.id}`, remotePlayer);
    }

    if (localPlayerId === 2 && state.room?.worlds) {
      for (const b of [
        ...(state.room.worlds.neutral?.blobbies ?? []),
        ...(state.room.worlds.dangerous?.blobbies ?? []),
      ]) {
        stepAndSwap(`blobby_${b.id}`, b);
      }
    }

    return () => {
      for (let i = saved.length - 1; i >= 0; i--) {
        const item = saved[i];
        item.entity.x = item.x;
        item.entity.y = item.y;
      }
    };
  }
}
