// src/net/peerManager.ts
// PeerJS WebRTC P2P manager implementing IPeerManager with injectable PeerFactory
// for deterministic Host <-> Client unit/integration testing.

import Peer, { DataConnection } from 'peerjs';
import {
  ConnectionState,
  IPeerManager,
  NetPacket,
} from '../shared/types';
import {
  deserializePacket,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  roomCodeToPeerId,
  serializePacket,
} from './protocol';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface PeerFactoryOptions {
  useCloudServer?: boolean;
  config?: {
    iceServers?: IceServerConfig[];
    sdpSemantics?: string;
  };
}

export interface PeerServerEndpointOptions {
  host: string;
  port: number;
  path: string;
  secure: boolean;
}

export const DEFAULT_SAME_ORIGIN_PEER_PATH = '/shift-peerjs/';

export interface IDataConnectionLike {
  readonly peer: string;
  readonly open: boolean;
  readonly isRelay?: boolean;
  send(data: unknown): void | Promise<void>;
  close(): void;
  on(event: 'open', listener: () => void): unknown;
  on(event: 'data', listener: (data: unknown) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
}

export interface IPeerSocketLike {
  send(data: unknown): void;
  on(event: string, listener: (data: unknown) => void): unknown;
  off?(event: string, listener: (data: unknown) => void): unknown;
  removeListener?(event: string, listener: (data: unknown) => void): unknown;
  _socket?: {
    bufferedAmount?: number;
    readyState?: number;
  };
}

export interface IPeerLike {
  readonly id: string;
  readonly destroyed: boolean;
  readonly disconnected: boolean;
  readonly socket?: IPeerSocketLike;
  _lostMessages?: Map<string, unknown[]>;
  connect(
    peerId: string,
    options?: { reliable?: boolean; serialization?: string }
  ): IDataConnectionLike;
  destroy(): void;
  disconnect(): void;
  reconnect?(): void;
  on(event: 'open', listener: (id: string) => void): unknown;
  on(event: 'connection', listener: (conn: IDataConnectionLike) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
  on(event: 'disconnected', listener: (currentId: string) => void): unknown;
  on(event: 'error', listener: (err: Error & { type?: string }) => void): unknown;
}

export type PeerFactory = (
  id?: string,
  options?: PeerFactoryOptions
) => IPeerLike;

export interface PeerManagerOptions {
  peerFactory?: PeerFactory;
  pingIntervalMs?: number;
  joinTimeoutMs?: number;
  relayFallbackDelayMs?: number;
  iceServers?: IceServerConfig[];
  now?: () => number;
}

export const DEFAULT_PING_INTERVAL_MS = 2000;
export const DEFAULT_JOIN_TIMEOUT_MS = 15000;
export const DEFAULT_RELAY_FALLBACK_DELAY_MS = 1200;

const RELAY_CONNECTION_ID = 'shift_ws_relay';
const RELAY_CANDIDATE_PREFIX = 'shift-relay:';
const RELAY_SYN_RETRY_MS = 1000;
const RELAY_MAX_BUFFERED_BYTES = 65536;
const RELAY_MAX_CHUNK_CHARS = 28000;

interface RelayEnvelope {
  kind: 'syn' | 'ack' | 'data' | 'chunk' | 'close';
  data?: unknown;
  chunkId?: number;
  index?: number;
  total?: number;
  part?: string;
}

function sendRelayEnvelope(
  socket: IPeerSocketLike,
  dstPeerId: string,
  envelope: RelayEnvelope
): void {
  try {
    socket.send({
      type: 'CANDIDATE',
      dst: dstPeerId,
      payload: {
        type: 'data',
        connectionId: RELAY_CONNECTION_ID,
        candidate: {
          candidate: RELAY_CANDIDATE_PREFIX + JSON.stringify(envelope),
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      },
    });
  } catch {
    // Ignore transient socket send errors
  }
}

function parseRelayMessage(
  raw: unknown,
  peerInstance: IPeerLike
): { srcPeerId: string; envelope: RelayEnvelope } | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const msg = raw as {
    type?: unknown;
    src?: unknown;
    payload?: {
      connectionId?: unknown;
      candidate?: {
        candidate?: unknown;
      };
    };
  };
  if (
    msg.type !== 'CANDIDATE' ||
    typeof msg.src !== 'string' ||
    msg.payload?.connectionId !== RELAY_CONNECTION_ID
  ) {
    return null;
  }

  // Prevent PeerJS from accumulating relay frames in _lostMessages
  peerInstance._lostMessages?.delete(RELAY_CONNECTION_ID);

  const candidateStr = msg.payload?.candidate?.candidate;
  if (
    typeof candidateStr !== 'string' ||
    !candidateStr.startsWith(RELAY_CANDIDATE_PREFIX)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      candidateStr.slice(RELAY_CANDIDATE_PREFIX.length)
    ) as RelayEnvelope;
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed.kind === 'syn' ||
        parsed.kind === 'ack' ||
        parsed.kind === 'data' ||
        parsed.kind === 'chunk' ||
        parsed.kind === 'close')
    ) {
      return { srcPeerId: msg.src, envelope: parsed };
    }
  } catch {
    // Ignore malformed relay envelope
  }
  return null;
}

class PeerSocketRelayConnection implements IDataConnectionLike {
  public readonly peer: string;
  public readonly isRelay = true;
  public open = false;

  private readonly peerInstance: IPeerLike;
  private readonly openListeners = new Set<() => void>();
  private readonly dataListeners = new Set<(data: unknown) => void>();
  private readonly closeListeners = new Set<() => void>();
  private readonly errorListeners = new Set<(err: Error) => void>();
  private nextChunkId = 1;
  private readonly incomingChunks = new Map<
    number,
    { total: number; parts: string[]; received: number }
  >();

  constructor(remotePeerId: string, peerInstance: IPeerLike) {
    this.peer = remotePeerId;
    this.peerInstance = peerInstance;
  }

  public markOpen(): void {
    if (this.open) {
      return;
    }
    this.open = true;
    for (const fn of Array.from(this.openListeners)) {
      fn();
    }
  }

  public send(data: unknown): void {
    if (!this.open || !this.peerInstance.socket) {
      return;
    }
    const buffered = this.peerInstance.socket._socket?.bufferedAmount ?? 0;
    if (buffered > RELAY_MAX_BUFFERED_BYTES && typeof data === 'string') {
      // Skip queuing redundant intermediate state snapshots if mobile TCP buffer is congested,
      // unless the state snapshot carries discrete GameEvents.
      if (
        data.includes('"type":"state"') &&
        data.includes('"events":[]')
      ) {
        return;
      }
    }
    if (typeof data === 'string' && data.length > RELAY_MAX_CHUNK_CHARS) {
      const chunkId = this.nextChunkId++;
      const total = Math.ceil(data.length / RELAY_MAX_CHUNK_CHARS);
      for (let i = 0; i < total; i++) {
        const part = data.slice(
          i * RELAY_MAX_CHUNK_CHARS,
          (i + 1) * RELAY_MAX_CHUNK_CHARS
        );
        sendRelayEnvelope(this.peerInstance.socket, this.peer, {
          kind: 'chunk',
          chunkId,
          index: i,
          total,
          part,
        });
      }
      return;
    }
    sendRelayEnvelope(this.peerInstance.socket, this.peer, {
      kind: 'data',
      data,
    });
  }

  public receiveEnvelope(envelope: RelayEnvelope): void {
    if (envelope.kind === 'data') {
      if (!this.open) {
        return;
      }
      for (const fn of Array.from(this.dataListeners)) {
        fn(envelope.data);
      }
    } else if (envelope.kind === 'chunk') {
      if (
        !this.open ||
        typeof envelope.chunkId !== 'number' ||
        typeof envelope.index !== 'number' ||
        typeof envelope.total !== 'number' ||
        typeof envelope.part !== 'string' ||
        envelope.total <= 0 ||
        envelope.index < 0 ||
        envelope.index >= envelope.total
      ) {
        return;
      }
      let entry = this.incomingChunks.get(envelope.chunkId);
      if (!entry) {
        if (this.incomingChunks.size > 16) {
          const oldestKey = this.incomingChunks.keys().next().value;
          if (oldestKey !== undefined) {
            this.incomingChunks.delete(oldestKey);
          }
        }
        entry = {
          total: envelope.total,
          parts: new Array<string>(envelope.total).fill(''),
          received: 0,
        };
        this.incomingChunks.set(envelope.chunkId, entry);
      }
      if (entry.parts[envelope.index] === '') {
        entry.parts[envelope.index] = envelope.part;
        entry.received++;
      }
      if (entry.received === entry.total) {
        this.incomingChunks.delete(envelope.chunkId);
        const reassembled = entry.parts.join('');
        for (const fn of Array.from(this.dataListeners)) {
          fn(reassembled);
        }
      }
    } else if (envelope.kind === 'close') {
      this.closeInternal(false);
    }
  }

  public close(): void {
    this.closeInternal(true);
  }

  public closeQuietlyForUpgrade(): void {
    this.open = false;
    this.openListeners.clear();
    this.dataListeners.clear();
    this.closeListeners.clear();
    this.errorListeners.clear();
  }

  private closeInternal(notifyRemote: boolean): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    if (notifyRemote && this.peerInstance.socket) {
      sendRelayEnvelope(this.peerInstance.socket, this.peer, {
        kind: 'close',
      });
    }
    for (const fn of Array.from(this.closeListeners)) {
      fn();
    }
  }

  public on(event: 'open', listener: () => void): unknown;
  public on(event: 'data', listener: (data: unknown) => void): unknown;
  public on(event: 'close', listener: () => void): unknown;
  public on(event: 'error', listener: (err: Error) => void): unknown;
  public on(
    event: 'open' | 'data' | 'close' | 'error',
    listener:
      | (() => void)
      | ((data: unknown) => void)
      | ((err: Error) => void)
  ): unknown {
    if (event === 'open') {
      this.openListeners.add(listener as () => void);
    } else if (event === 'data') {
      this.dataListeners.add(listener as (data: unknown) => void);
    } else if (event === 'close') {
      this.closeListeners.add(listener as () => void);
    } else if (event === 'error') {
      this.errorListeners.add(listener as (err: Error) => void);
    }
    return this;
  }
}

/**
 * Default STUN servers replacing PeerJS's built-in DEFAULT_CONFIG (which contains
 * decommissioned NXDOMAIN eu-0.turn.peerjs.com / us-0.turn.peerjs.com hosts that
 * stall mobile WebRTC ICE gathering).
 */
export const DEFAULT_ICE_SERVERS: readonly IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.relay.metered.ca:80' },
];

const NON_FATAL_SIGNALING_ERROR_TYPES = new Set<string>([
  'network',
  'disconnected',
  'socket-error',
  'socket-closed',
]);

function getDefaultEnv(): Record<string, string | undefined> {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
    if (metaEnv && typeof metaEnv === 'object') {
      return metaEnv;
    }
  } catch {
    // Ignore environment access errors
  }
  return {};
}

/**
 * Builds the WebRTC ICE server list by combining DEFAULT_ICE_SERVERS with optional
 * TURN / ICE servers from environment variables (`VITE_ICE_SERVERS` JSON or
 * `VITE_TURN_URLS` + `VITE_TURN_USERNAME` + `VITE_TURN_CREDENTIAL`) or explicit overrides.
 */
export function buildIceServers(
  env: Record<string, string | undefined> = getDefaultEnv(),
  customIceServers?: readonly IceServerConfig[]
): IceServerConfig[] {
  if (customIceServers && customIceServers.length > 0) {
    return customIceServers.map((s) => ({ ...s }));
  }

  const servers: IceServerConfig[] = DEFAULT_ICE_SERVERS.map((s) => ({ ...s }));

  const rawJson = env.VITE_ICE_SERVERS?.trim();
  if (rawJson) {
    try {
      const parsed: unknown = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (
            item &&
            typeof item === 'object' &&
            'urls' in item &&
            (typeof (item as { urls: unknown }).urls === 'string' ||
              Array.isArray((item as { urls: unknown }).urls))
          ) {
            const entry: IceServerConfig = {
              urls: (item as { urls: string | string[] }).urls,
            };
            if (typeof (item as { username?: unknown }).username === 'string') {
              entry.username = (item as { username: string }).username;
            }
            if (typeof (item as { credential?: unknown }).credential === 'string') {
              entry.credential = (item as { credential: string }).credential;
            }
            servers.push(entry);
          }
        }
      }
    } catch {
      // Ignore malformed VITE_ICE_SERVERS JSON
    }
  }

  const rawTurnUrls = env.VITE_TURN_URLS?.trim();
  if (rawTurnUrls) {
    const urlList = rawTurnUrls
      .split(',')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    if (urlList.length > 0) {
      const turnEntry: IceServerConfig = {
        urls: urlList.length === 1 ? urlList[0] : urlList,
      };
      if (env.VITE_TURN_USERNAME) {
        turnEntry.username = env.VITE_TURN_USERNAME;
      }
      if (env.VITE_TURN_CREDENTIAL) {
        turnEntry.credential = env.VITE_TURN_CREDENTIAL;
      }
      servers.push(turnEntry);
    }
  }

  return servers;
}

export function buildDefaultPeerServerOptions(
  loc?: { protocol?: string; hostname?: string; port?: string } | null
): PeerServerEndpointOptions | null {
  if (
    !loc ||
    !loc.hostname ||
    (loc.protocol !== 'http:' && loc.protocol !== 'https:')
  ) {
    return null;
  }
  const secure = loc.protocol === 'https:';
  const parsedPort = loc.port ? Number(loc.port) : NaN;
  const port =
    Number.isFinite(parsedPort) && parsedPort > 0
      ? parsedPort
      : secure
      ? 443
      : 80;
  return {
    host: loc.hostname,
    port,
    path: DEFAULT_SAME_ORIGIN_PEER_PATH,
    secure,
  };
}

function defaultPeerFactory(
  id?: string,
  options?: PeerFactoryOptions
): IPeerLike {
  const sameOriginOpts =
    !options?.useCloudServer && typeof window !== 'undefined'
      ? buildDefaultPeerServerOptions(window.location)
      : null;

  const peerOptions = {
    ...(sameOriginOpts ?? {}),
    config: {
      iceServers: options?.config?.iceServers ?? buildIceServers(),
      sdpSemantics: options?.config?.sdpSemantics ?? 'unified-plan',
    },
  };
  const resolvedId =
    id && id.trim().length > 0
      ? id.trim()
      : `shift-client-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
  const peer = new Peer(resolvedId, peerOptions);
  return peer as unknown as IPeerLike;
}

function defaultNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export class PeerManager implements IPeerManager {
  private readonly peerFactory: PeerFactory;
  private readonly pingIntervalMs: number;
  private readonly joinTimeoutMs: number;
  private readonly relayFallbackDelayMs: number;
  private readonly iceServers: IceServerConfig[];
  private readonly now: () => number;

  private peer: IPeerLike | null = null;
  private dataConnection: IDataConnectionLike | null = null;
  private roomCode: string | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private rttMs = 0;
  private pingTimerId: ReturnType<typeof setInterval> | null = null;
  private joinTimerId: ReturnType<typeof setTimeout> | null = null;
  private relayFallbackTimerId: ReturnType<typeof setTimeout> | null = null;
  private relaySynIntervalId: ReturnType<typeof setInterval> | null = null;

  private readonly packetHandlers = new Set<(packet: NetPacket) => void>();
  private readonly stateHandlers = new Set<
    (state: ConnectionState, error?: string) => void
  >();

  constructor(optionsOrFactory?: PeerManagerOptions | PeerFactory) {
    if (typeof optionsOrFactory === 'function') {
      this.peerFactory = optionsOrFactory;
      this.pingIntervalMs = DEFAULT_PING_INTERVAL_MS;
      this.joinTimeoutMs = DEFAULT_JOIN_TIMEOUT_MS;
      this.relayFallbackDelayMs = DEFAULT_RELAY_FALLBACK_DELAY_MS;
      this.iceServers = buildIceServers();
      this.now = defaultNow;
    } else {
      this.peerFactory = optionsOrFactory?.peerFactory ?? defaultPeerFactory;
      this.pingIntervalMs = optionsOrFactory?.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
      this.joinTimeoutMs = optionsOrFactory?.joinTimeoutMs ?? DEFAULT_JOIN_TIMEOUT_MS;
      this.relayFallbackDelayMs =
        optionsOrFactory?.relayFallbackDelayMs ?? DEFAULT_RELAY_FALLBACK_DELAY_MS;
      this.iceServers = buildIceServers(undefined, optionsOrFactory?.iceServers);
      this.now = optionsOrFactory?.now ?? defaultNow;
    }
  }

  public isUsingRelay(): boolean {
    return Boolean(this.dataConnection?.open && this.dataConnection?.isRelay);
  }

  public hostRoom(customCode?: string): Promise<string> {
    this.cleanupInternal(false);

    const code =
      customCode !== undefined && customCode.trim().length > 0
        ? normalizeRoomCode(customCode)
        : generateRoomCode();

    if (!isValidRoomCode(code)) {
      const errMsg = `Invalid room code: "${customCode ?? ''}"`;
      this.setState('error', errMsg);
      return Promise.reject(new Error(errMsg));
    }

    this.roomCode = code;
    this.setState('hosting');

    const peerId = roomCodeToPeerId(code);

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let peerInstance: IPeerLike;

      try {
        peerInstance = this.peerFactory(peerId, {
          config: {
            iceServers: this.iceServers,
            sdpSemantics: 'unified-plan',
          },
        });
        this.peer = peerInstance;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.setState('error', msg);
        reject(new Error(msg));
        return;
      }

      if (peerInstance.socket) {
        const socket = peerInstance.socket;
        socket.on('message', (raw: unknown) => {
          if (this.peer !== peerInstance) {
            return;
          }
          const parsed = parseRelayMessage(raw, peerInstance);
          if (!parsed) {
            return;
          }
          const { srcPeerId, envelope } = parsed;

          if (envelope.kind === 'syn') {
            // If already connected to a different partner, reject/ignore
            if (
              this.dataConnection &&
              this.dataConnection.open &&
              this.dataConnection.peer !== srcPeerId
            ) {
              return;
            }
            // If direct WebRTC is already open with this partner, no relay needed
            if (
              this.dataConnection &&
              this.dataConnection.open &&
              !this.dataConnection.isRelay &&
              this.dataConnection.peer === srcPeerId
            ) {
              return;
            }
            // If relay is already open with this partner, re-ACK idempotently
            if (
              this.dataConnection instanceof PeerSocketRelayConnection &&
              this.dataConnection.open &&
              this.dataConnection.peer === srcPeerId
            ) {
              sendRelayEnvelope(socket, srcPeerId, { kind: 'ack' });
              return;
            }

            const relayConn = new PeerSocketRelayConnection(
              srcPeerId,
              peerInstance
            );
            sendRelayEnvelope(socket, srcPeerId, { kind: 'ack' });
            this.attachDataConnection(relayConn);
            relayConn.markOpen();
            return;
          }

          if (
            this.dataConnection instanceof PeerSocketRelayConnection &&
            this.dataConnection.peer === srcPeerId
          ) {
            this.dataConnection.receiveEnvelope(envelope);
          }
        });
      }

      peerInstance.on('open', () => {
        if (this.peer !== peerInstance) {
          return;
        }
        if (!settled) {
          settled = true;
          resolve(code);
        }
      });

      peerInstance.on('connection', (conn: IDataConnectionLike) => {
        if (this.peer !== peerInstance) {
          return;
        }
        // If already connected via direct WebRTC, or connected to a different peer, reject
        if (this.dataConnection && this.dataConnection.open) {
          if (
            this.dataConnection.isRelay &&
            this.dataConnection.peer === conn.peer
          ) {
            // Allow direct WebRTC connection from same partner to upgrade the WS relay once open
            this.watchWebRtcUpgrade(conn);
            return;
          }
          conn.close();
          return;
        }
        this.attachDataConnection(conn);
        // Also watch in case WS relay connects first while conn is still negotiating ICE
        this.watchWebRtcUpgrade(conn);
      });

      peerInstance.on('disconnected', () => {
        if (this.peer !== peerInstance || peerInstance.destroyed) {
          return;
        }
        // Reconnect signaling broker if waiting in lobby ('hosting') or using WS signaling relay
        if (
          this.connectionState === 'hosting' ||
          (this.connectionState === 'connected' && this.dataConnection?.isRelay)
        ) {
          this.tryReconnectPeer(peerInstance);
        }
      });

      peerInstance.on('error', (err: Error & { type?: string }) => {
        if (this.peer !== peerInstance) {
          return;
        }
        const errType = err?.type ?? '';

        // Ignore non-fatal WebRTC ICE candidate errors (e.g. mobile multi-interface /
        // IPv6 / mDNS candidate rejection during Trickle ICE negotiation).
        if (errType === 'webrtc') {
          return;
        }

        // Ignore signaling broker drops once P2P DataChannel is already open & active,
        // or auto-reconnect signaling while waiting in lobby ('hosting') or using WS relay.
        if (NON_FATAL_SIGNALING_ERROR_TYPES.has(errType)) {
          if (this.connectionState === 'connected' && this.dataConnection?.open) {
            if (this.dataConnection.isRelay) {
              this.tryReconnectPeer(peerInstance);
            }
            return;
          }
          if (this.connectionState === 'hosting' && settled) {
            this.tryReconnectPeer(peerInstance);
            return;
          }
        }

        const msg = err?.message || err?.type || 'Peer host error';
        this.stopPingLoop();
        this.setState('error', msg);
        if (!settled) {
          settled = true;
          reject(new Error(msg));
        }
      });

      peerInstance.on('close', () => {
        if (this.peer !== peerInstance) {
          return;
        }
        this.stopPingLoop();
        if (this.connectionState !== 'error' && this.connectionState !== 'disconnected') {
          this.setState('disconnected');
        }
      });
    });
  }

  public joinRoom(roomCode: string): Promise<void> {
    this.cleanupInternal(false);

    const normalized = normalizeRoomCode(roomCode);
    if (!isValidRoomCode(normalized)) {
      const errMsg = `Invalid room code: "${roomCode}"`;
      this.setState('error', errMsg);
      return Promise.reject(new Error(errMsg));
    }

    this.roomCode = normalized;
    this.setState('joining');
    const targetPeerId = roomCodeToPeerId(normalized);

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let peerInstance: IPeerLike;

      try {
        peerInstance = this.peerFactory(undefined, {
          config: {
            iceServers: this.iceServers,
            sdpSemantics: 'unified-plan',
          },
        });
        this.peer = peerInstance;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.setState('error', msg);
        reject(new Error(msg));
        return;
      }

      const hasRelaySupport = Boolean(peerInstance.socket);

      const succeedJoin = (): void => {
        this.clearJoinTimer();
        this.clearRelayTimers();
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      const failJoin = (msg: string): void => {
        this.clearJoinTimer();
        this.clearRelayTimers();
        this.stopPingLoop();
        this.setState('error', msg);
        if (!settled) {
          settled = true;
          reject(new Error(msg));
        }
      };

      const startRelaySynLoop = (): void => {
        if (
          !peerInstance.socket ||
          this.peer !== peerInstance ||
          settled ||
          (this.dataConnection && this.dataConnection.open)
        ) {
          return;
        }
        this.clearRelayTimers();
        const socket = peerInstance.socket;
        sendRelayEnvelope(socket, targetPeerId, { kind: 'syn' });
        this.relaySynIntervalId = setInterval(() => {
          if (
            this.peer !== peerInstance ||
            settled ||
            (this.dataConnection && this.dataConnection.open)
          ) {
            this.clearRelayTimers();
            return;
          }
          sendRelayEnvelope(socket, targetPeerId, { kind: 'syn' });
        }, RELAY_SYN_RETRY_MS);
      };

      let relayUnavailableErrors = 0;

      if (peerInstance.socket) {
        const socket = peerInstance.socket;
        socket.on('message', (raw: unknown) => {
          if (this.peer !== peerInstance) {
            return;
          }
          const parsed = parseRelayMessage(raw, peerInstance);
          if (!parsed || parsed.srcPeerId !== targetPeerId) {
            return;
          }
          relayUnavailableErrors = 0;
          const { envelope } = parsed;

          if (envelope.kind === 'ack') {
            this.clearRelayTimers();
            // If direct WebRTC already opened, ignore
            if (this.dataConnection && this.dataConnection.open) {
              return;
            }
            const relayConn = new PeerSocketRelayConnection(
              targetPeerId,
              peerInstance
            );
            this.attachDataConnection(relayConn, succeedJoin, failJoin);
            relayConn.markOpen();
            return;
          }

          if (
            this.dataConnection instanceof PeerSocketRelayConnection &&
            this.dataConnection.peer === targetPeerId
          ) {
            this.dataConnection.receiveEnvelope(envelope);
          }
        });
      }

      if (this.joinTimeoutMs > 0) {
        this.joinTimerId = setTimeout(() => {
          if (this.peer !== peerInstance || settled) {
            return;
          }
          const pendingConn = this.dataConnection;
          this.dataConnection = null;
          if (pendingConn) {
            try {
              pendingConn.close();
            } catch {
              // Ignore close errors
            }
          }
          failJoin(
            'Connection timed out — check room code or network/TURN relay'
          );
        }, this.joinTimeoutMs);
      }

      peerInstance.on('open', () => {
        if (this.peer !== peerInstance) {
          return;
        }
        try {
          const conn = peerInstance.connect(targetPeerId, {
            reliable: true,
          });
          this.attachDataConnection(
            conn,
            succeedJoin,
            (errMsg) => {
              // If signaling WebSocket relay is available, don't abort on WebRTC ICE failure;
              // immediately trigger the WS relay handshake instead.
              if (hasRelaySupport && !settled) {
                startRelaySynLoop();
                return;
              }
              failJoin(errMsg);
            }
          );
          this.watchWebRtcUpgrade(conn, succeedJoin);

          if (hasRelaySupport) {
            if (this.relayFallbackDelayMs <= 0) {
              startRelaySynLoop();
            } else {
              this.relayFallbackTimerId = setTimeout(() => {
                startRelaySynLoop();
              }, this.relayFallbackDelayMs);
            }
          }
        } catch (err) {
          if (hasRelaySupport && !settled) {
            startRelaySynLoop();
            return;
          }
          const msg = err instanceof Error ? err.message : String(err);
          failJoin(msg);
        }
      });

      peerInstance.on('disconnected', () => {
        if (this.peer !== peerInstance || peerInstance.destroyed) {
          return;
        }
        if (this.connectionState === 'connected' && this.dataConnection?.isRelay) {
          this.tryReconnectPeer(peerInstance);
        }
      });

      peerInstance.on('error', (err: Error & { type?: string }) => {
        if (this.peer !== peerInstance) {
          return;
        }
        const errType = err?.type ?? '';

        // Ignore non-fatal WebRTC ICE candidate warnings during mobile negotiation
        if (errType === 'webrtc') {
          return;
        }

        // Ignore signaling server drops once P2P DataChannel is already open,
        // or reconnect signaling if using WS relay.
        if (
          NON_FATAL_SIGNALING_ERROR_TYPES.has(errType) &&
          this.connectionState === 'connected' &&
          this.dataConnection?.open
        ) {
          if (this.dataConnection.isRelay) {
            this.tryReconnectPeer(peerInstance);
          }
          return;
        }

        // Ignore expired WebRTC OFFER/CANDIDATE notices once connected,
        // or tolerate brief Host signaling reconnects on WS relay (< 5 consecutive misses).
        if (
          errType === 'peer-unavailable' &&
          settled &&
          this.connectionState === 'connected' &&
          this.dataConnection?.open
        ) {
          if (!this.dataConnection.isRelay) {
            return;
          }
          relayUnavailableErrors++;
          if (relayUnavailableErrors < 5) {
            return;
          }
        }

        const msg = err?.message || err?.type || 'Unable to connect to room';
        failJoin(msg);
      });

      peerInstance.on('close', () => {
        if (this.peer !== peerInstance) {
          return;
        }
        this.clearJoinTimer();
        this.clearRelayTimers();
        this.stopPingLoop();
        if (!settled) {
          failJoin('Connection closed before room handshake completed');
          return;
        }
        if (this.connectionState !== 'error' && this.connectionState !== 'disconnected') {
          this.setState('disconnected');
        }
      });
    });
  }

  public sendPacket(packet: NetPacket): void {
    if (!this.dataConnection || !this.dataConnection.open) {
      return;
    }
    try {
      this.dataConnection.send(serializePacket(packet));
    } catch {
      // Ignore transient send errors on closing channel
    }
  }

  public onPacket(handler: (packet: NetPacket) => void): void {
    this.packetHandlers.add(handler);
  }

  public onStateChange(
    handler: (state: ConnectionState, error?: string) => void
  ): void {
    this.stateHandlers.add(handler);
  }

  public getRoomCode(): string | null {
    return this.roomCode;
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public getRttMs(): number {
    return this.rttMs;
  }

  public disconnect(): void {
    this.cleanupInternal(true);
  }

  private attachDataConnection(
    conn: IDataConnectionLike,
    onConnected?: () => void,
    onConnectError?: (msg: string) => void
  ): void {
    this.dataConnection = conn;

    const handleOpen = (): void => {
      if (this.dataConnection !== conn) {
        return;
      }
      this.setState('connected');
      this.startPingLoop();
      if (onConnected) {
        onConnected();
      }
    };

    conn.on('open', handleOpen);

    conn.on('data', (rawData: unknown) => {
      if (this.dataConnection !== conn) {
        return;
      }
      const packet = deserializePacket(rawData);
      if (!packet) {
        return;
      }

      if (packet.type === 'ping') {
        this.sendPacket({
          type: 'pong',
          timestamp: packet.timestamp,
        });
      } else if (packet.type === 'pong') {
        const elapsed = this.now() - packet.timestamp;
        if (Number.isFinite(elapsed) && elapsed >= 0) {
          this.rttMs = Math.round(elapsed);
        }
      }

      for (const handler of Array.from(this.packetHandlers)) {
        handler(packet);
      }
    });

    conn.on('close', () => {
      if (this.dataConnection !== conn) {
        return;
      }
      this.stopPingLoop();
      this.dataConnection = null;
      if (this.connectionState === 'joining' && onConnectError) {
        onConnectError('Data connection closed during join');
        return;
      }
      if (this.connectionState !== 'disconnected' && this.connectionState !== 'error') {
        this.setState('disconnected');
      }
    });

    conn.on('error', (err: Error) => {
      if (this.dataConnection !== conn) {
        return;
      }
      const msg = err?.message || 'DataChannel error';
      this.stopPingLoop();
      if (onConnectError && this.connectionState === 'joining') {
        onConnectError(msg);
      } else {
        this.setState('error', msg);
      }
    });

    if (conn.open) {
      handleOpen();
    }
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.sendPing();
    this.pingTimerId = setInterval(() => {
      this.sendPing();
    }, this.pingIntervalMs);
  }

  private sendPing(): void {
    if (this.connectionState === 'connected' && this.dataConnection?.open) {
      this.sendPacket({
        type: 'ping',
        timestamp: this.now(),
      });
    }
  }

  private stopPingLoop(): void {
    if (this.pingTimerId !== null) {
      clearInterval(this.pingTimerId);
      this.pingTimerId = null;
    }
  }

  private watchWebRtcUpgrade(
    conn: IDataConnectionLike,
    onConnected?: () => void
  ): void {
    conn.on('open', () => {
      if (this.dataConnection === conn) {
        return;
      }
      if (
        this.dataConnection instanceof PeerSocketRelayConnection &&
        this.dataConnection.peer === conn.peer
      ) {
        this.dataConnection.closeQuietlyForUpgrade();
        this.attachDataConnection(conn, onConnected);
      }
    });
  }

  private clearRelayTimers(): void {
    if (this.relayFallbackTimerId !== null) {
      clearTimeout(this.relayFallbackTimerId);
      this.relayFallbackTimerId = null;
    }
    if (this.relaySynIntervalId !== null) {
      clearInterval(this.relaySynIntervalId);
      this.relaySynIntervalId = null;
    }
  }

  private clearJoinTimer(): void {
    if (this.joinTimerId !== null) {
      clearTimeout(this.joinTimerId);
      this.joinTimerId = null;
    }
  }

  private tryReconnectPeer(peerInstance: IPeerLike): void {
    if (
      this.peer !== peerInstance ||
      peerInstance.destroyed ||
      typeof peerInstance.reconnect !== 'function'
    ) {
      return;
    }
    try {
      peerInstance.reconnect();
    } catch {
      // Ignore reconnect errors
    }
  }

  private cleanupInternal(emitDisconnected: boolean): void {
    this.clearJoinTimer();
    this.clearRelayTimers();
    this.stopPingLoop();

    const activeConn = this.dataConnection;
    this.dataConnection = null;
    if (activeConn) {
      try {
        activeConn.close();
      } catch {
        // Ignore close errors
      }
    }

    const activePeer = this.peer;
    this.peer = null;
    if (activePeer) {
      try {
        activePeer.destroy();
      } catch {
        // Ignore destroy errors
      }
    }

    this.roomCode = null;
    this.rttMs = 0;

    if (emitDisconnected && this.connectionState !== 'disconnected') {
      this.setState('disconnected');
    } else if (!emitDisconnected) {
      this.connectionState = 'disconnected';
    }
  }

  private setState(nextState: ConnectionState, error?: string): void {
    if (this.connectionState === nextState && error === undefined) {
      return;
    }
    this.connectionState = nextState;
    for (const handler of Array.from(this.stateHandlers)) {
      handler(nextState, error);
    }
  }
}

// ============================================================================
// Deterministic In-Memory PeerJS Bus for Unit & Integration Testing
// ============================================================================

type AnyListener = (...args: never[]) => void;

class SimpleEmitter {
  private readonly listeners = new Map<string, Set<AnyListener>>();

  public on(event: string, listener: AnyListener): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  protected emit(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event);
    if (!set) {
      return;
    }
    for (const fn of Array.from(set)) {
      (fn as (...a: unknown[]) => void)(...args);
    }
  }
}

class InMemoryDataConnection extends SimpleEmitter implements IDataConnectionLike {
  public readonly peer: string;
  public open = false;
  private remote: InMemoryDataConnection | null = null;
  private readonly bus: InMemoryPeerBus;

  constructor(peerId: string, bus: InMemoryPeerBus) {
    super();
    this.peer = peerId;
    this.bus = bus;
  }

  public linkRemote(remote: InMemoryDataConnection): void {
    this.remote = remote;
  }

  public markOpen(): void {
    if (this.open) {
      return;
    }
    this.open = true;
    this.emit('open');
  }

  public send(data: unknown): void {
    if (!this.open || !this.remote || !this.remote.open) {
      return;
    }
    const target = this.remote;
    const latency = this.bus.getLatencyMs();
    if (latency <= 0) {
      target.receiveData(data);
    } else {
      setTimeout(() => {
        if (target.open) {
          target.receiveData(data);
        }
      }, latency);
    }
  }

  public receiveData(data: unknown): void {
    if (!this.open) {
      return;
    }
    this.emit('data', data);
  }

  public close(): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.emit('close');
    const r = this.remote;
    this.remote = null;
    if (r && r.open) {
      r.close();
    }
  }
}

class InMemoryPeer extends SimpleEmitter implements IPeerLike {
  public readonly id: string;
  public destroyed = false;
  public disconnected = false;
  private readonly bus: InMemoryPeerBus;
  private readonly connections = new Set<InMemoryDataConnection>();

  constructor(id: string, bus: InMemoryPeerBus, duplicateIdError: boolean) {
    super();
    this.id = id;
    this.bus = bus;

    queueMicrotask(() => {
      if (this.destroyed) {
        return;
      }
      if (duplicateIdError) {
        const err = new Error(`ID "${id}" is taken`) as Error & { type?: string };
        err.type = 'unavailable-id';
        this.emit('error', err);
        return;
      }
      this.emit('open', this.id);
    });
  }

  public connect(targetPeerId: string): IDataConnectionLike {
    const clientConn = new InMemoryDataConnection(targetPeerId, this.bus);
    this.connections.add(clientConn);

    const hostPeer = this.bus.getPeer(targetPeerId);
    if (!hostPeer || hostPeer.destroyed || hostPeer.disconnected) {
      queueMicrotask(() => {
        const err = new Error(
          `Could not connect to peer ${targetPeerId}`
        ) as Error & { type?: string };
        err.type = 'peer-unavailable';
        this.emit('error', err);
      });
      return clientConn;
    }

    const hostConn = new InMemoryDataConnection(this.id, this.bus);
    hostPeer.connections.add(hostConn);

    clientConn.linkRemote(hostConn);
    hostConn.linkRemote(clientConn);

    queueMicrotask(() => {
      if (this.destroyed || hostPeer.destroyed) {
        return;
      }
      hostPeer.acceptIncomingConnection(hostConn);
      hostConn.markOpen();
      clientConn.markOpen();
    });

    return clientConn;
  }

  public acceptIncomingConnection(conn: InMemoryDataConnection): void {
    this.emit('connection', conn);
  }

  public disconnect(): void {
    if (this.disconnected) {
      return;
    }
    this.disconnected = true;
    this.emit('disconnected', this.id);
  }

  public reconnect(): void {
    if (this.destroyed || !this.disconnected) {
      return;
    }
    this.disconnected = false;
    this.emit('open', this.id);
  }

  public emitPeerError(err: Error & { type?: string }): void {
    this.emit('error', err);
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.disconnected = true;
    for (const conn of Array.from(this.connections)) {
      conn.close();
    }
    this.connections.clear();
    this.bus.unregisterPeer(this.id, this);
    this.emit('close');
  }
}

/**
 * In-memory PeerJS broker and DataChannel bus for deterministic unit testing.
 */
export class InMemoryPeerBus {
  private readonly peers = new Map<string, InMemoryPeer>();
  private autoIdCounter = 1;
  private latencyMs = 0;

  public setLatencyMs(ms: number): void {
    this.latencyMs = Math.max(0, ms);
  }

  public getLatencyMs(): number {
    return this.latencyMs;
  }

  public createPeerFactory(): PeerFactory {
    return (requestedId?: string): IPeerLike => {
      const id =
        requestedId && requestedId.trim().length > 0
          ? requestedId.trim()
          : `inmem-client-${this.autoIdCounter++}`;
      const existing = this.peers.get(id);
      if (existing && !existing.destroyed) {
        return new InMemoryPeer(id, this, true);
      }
      const peer = new InMemoryPeer(id, this, false);
      this.peers.set(id, peer);
      return peer;
    };
  }

  public getPeer(id: string): InMemoryPeer | undefined {
    return this.peers.get(id);
  }

  public unregisterPeer(id: string, peer: InMemoryPeer): void {
    if (this.peers.get(id) === peer) {
      this.peers.delete(id);
    }
  }
}

// Re-export PeerJS DataConnection type reference for consumers if needed
export type { DataConnection };
