// src/net/protocol.ts
// Room code generation/parsing, URL helpers, sequence-numbered input tracking,
// idempotent GameEvent deduplication, and WebRTC packet validation/serialization.

import {
  GameEvent,
  GameState,
  InputPacket,
  LobbyConfig,
  LobbySyncPacket,
  NetPacket,
  PingKind,
  PingPongPacket,
  PlayerInput,
  StatePacket,
  createDefaultPlayerInput,
} from '../shared/types';

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
  return validMode && validVis && validShift && validAudio;
}

export function isValidNetPacket(value: unknown): value is NetPacket {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'input': {
      const validPlayerId = value.playerId === 1 || value.playerId === 2;
      return (
        validPlayerId &&
        isNonNegativeNumber(value.clientTick) &&
        isValidPlayerInput(value.input)
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

/**
 * Serializes a validated NetPacket into a JSON string for WebRTC DataChannel transmission.
 */
export function serializePacket(packet: NetPacket): string {
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

  return parsed as InputPacket | StatePacket | LobbySyncPacket | PingPongPacket;
}
