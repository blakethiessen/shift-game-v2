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

export interface IDataConnectionLike {
  readonly peer: string;
  readonly open: boolean;
  send(data: unknown): void | Promise<void>;
  close(): void;
  on(event: 'open', listener: () => void): unknown;
  on(event: 'data', listener: (data: unknown) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
}

export interface IPeerLike {
  readonly id: string;
  readonly destroyed: boolean;
  readonly disconnected: boolean;
  connect(
    peerId: string,
    options?: { reliable?: boolean; serialization?: string }
  ): IDataConnectionLike;
  destroy(): void;
  disconnect(): void;
  on(event: 'open', listener: (id: string) => void): unknown;
  on(event: 'connection', listener: (conn: IDataConnectionLike) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
  on(event: 'disconnected', listener: (currentId: string) => void): unknown;
  on(event: 'error', listener: (err: Error & { type?: string }) => void): unknown;
}

export type PeerFactory = (id?: string) => IPeerLike;

export interface PeerManagerOptions {
  peerFactory?: PeerFactory;
  pingIntervalMs?: number;
  now?: () => number;
}

export const DEFAULT_PING_INTERVAL_MS = 2000;

function defaultPeerFactory(id?: string): IPeerLike {
  const peer = id ? new Peer(id) : new Peer();
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
  private readonly now: () => number;

  private peer: IPeerLike | null = null;
  private dataConnection: IDataConnectionLike | null = null;
  private roomCode: string | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private rttMs = 0;
  private pingTimerId: ReturnType<typeof setInterval> | null = null;

  private readonly packetHandlers = new Set<(packet: NetPacket) => void>();
  private readonly stateHandlers = new Set<
    (state: ConnectionState, error?: string) => void
  >();

  constructor(optionsOrFactory?: PeerManagerOptions | PeerFactory) {
    if (typeof optionsOrFactory === 'function') {
      this.peerFactory = optionsOrFactory;
      this.pingIntervalMs = DEFAULT_PING_INTERVAL_MS;
      this.now = defaultNow;
    } else {
      this.peerFactory = optionsOrFactory?.peerFactory ?? defaultPeerFactory;
      this.pingIntervalMs = optionsOrFactory?.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
      this.now = optionsOrFactory?.now ?? defaultNow;
    }
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
        peerInstance = this.peerFactory(peerId);
        this.peer = peerInstance;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.setState('error', msg);
        reject(new Error(msg));
        return;
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
        // Only accept one active partner connection at a time
        if (this.dataConnection && this.dataConnection.open) {
          conn.close();
          return;
        }
        this.attachDataConnection(conn);
      });

      peerInstance.on('error', (err: Error & { type?: string }) => {
        if (this.peer !== peerInstance) {
          return;
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
        peerInstance = this.peerFactory();
        this.peer = peerInstance;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.setState('error', msg);
        reject(new Error(msg));
        return;
      }

      const failJoin = (msg: string): void => {
        this.stopPingLoop();
        this.setState('error', msg);
        if (!settled) {
          settled = true;
          reject(new Error(msg));
        }
      };

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
            () => {
              if (!settled) {
                settled = true;
                resolve();
              }
            },
            (errMsg) => {
              failJoin(errMsg);
            }
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failJoin(msg);
        }
      });

      peerInstance.on('error', (err: Error & { type?: string }) => {
        if (this.peer !== peerInstance) {
          return;
        }
        const msg = err?.message || err?.type || 'Unable to connect to room';
        failJoin(msg);
      });

      peerInstance.on('close', () => {
        if (this.peer !== peerInstance) {
          return;
        }
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

  private cleanupInternal(emitDisconnected: boolean): void {
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
