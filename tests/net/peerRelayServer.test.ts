// tests/net/peerRelayServer.test.ts
// Unit and integration tests for the built-in Same-Origin PeerJS Signaling & Relay Server.

import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '../../src/core/gameEngine';
import {
  buildDefaultPeerServerOptions,
  DEFAULT_SAME_ORIGIN_PEER_PATH,
  IPeerLike,
  IPeerSocketLike,
  PeerFactory,
  PeerManager,
} from '../../src/net/peerManager';
import { attachPeerRelayServer } from '../../src/net/peerRelayServer';
import { createDefaultPlayerInput } from '../../src/shared/types';

const requirePkg = createRequire(path.join(process.cwd(), 'package.json'));
const WebSocketCtor = requirePkg('ws') as {
  new (url: string): {
    readyState: number;
    send(data: string): void;
    close(): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
  };
  OPEN: number;
};

function startTestServer(): Promise<{
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    const server = http.createServer();
    attachPeerRelayServer(server);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        server,
        port,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}

describe('PeerRelayServer & Same-Origin Relay Integration', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) {
        await fn();
      }
    }
  });

  it('builds same-origin PeerServer options from browser location', () => {
    const httpsOpts = buildDefaultPeerServerOptions({
      protocol: 'https:',
      hostname: 'bazzite.tail80acff.ts.net',
      port: '5173',
    });
    expect(httpsOpts).toEqual({
      host: 'bazzite.tail80acff.ts.net',
      port: 5173,
      path: DEFAULT_SAME_ORIGIN_PEER_PATH,
      secure: true,
    });

    const defaultHttpsPort = buildDefaultPeerServerOptions({
      protocol: 'https:',
      hostname: 'example.com',
      port: '',
    });
    expect(defaultHttpsPort).toEqual({
      host: 'example.com',
      port: 443,
      path: DEFAULT_SAME_ORIGIN_PEER_PATH,
      secure: true,
    });

    const nullOpts = buildDefaultPeerServerOptions(null);
    expect(nullOpts).toBeNull();
  });

  it('serves GET /shift-peerjs/peerjs/id with a unique peer ID', async () => {
    const { port, close } = await startTestServer();
    cleanups.push(close);

    const res = await fetch(
      `http://127.0.0.1:${port}/shift-peerjs/peerjs/id?ts=${Date.now()}`
    );
    expect(res.status).toBe(200);
    const id = (await res.text()).trim();
    expect(id.length).toBeGreaterThan(5);
  });

  it('sustains 400+ continuous 60Hz StatePacket + InputPacket frames over WebSocket relay without disconnecting', async () => {
    const { port, close } = await startTestServer();
    cleanups.push(close);

    // Create a PeerFactory backed by real WebSockets connected to our local PeerRelayServer,
    // where direct WebRTC DataConnection never opens (simulating mobile NAT fallback).
    const createWsBackedPeerFactory = (): PeerFactory => {
      let clientCounter = 1;
      return (requestedId?: string): IPeerLike => {
        const peerId =
          requestedId && requestedId.trim().length > 0
            ? requestedId.trim()
            : `ws-client-${clientCounter++}`;
        const token = Math.random().toString(36).slice(2);
        const wsUrl = `ws://127.0.0.1:${port}/shift-peerjs/peerjs?key=peerjs&id=${encodeURIComponent(
          peerId
        )}&token=${encodeURIComponent(token)}&version=1.5.5`;

        const ws = new WebSocketCtor(wsUrl);
        const socketListeners = new Map<string, Set<(data: unknown) => void>>();
        const peerListeners = new Map<string, Set<(...args: unknown[]) => void>>();

        const emitPeer = (ev: string, ...args: unknown[]) => {
          const set = peerListeners.get(ev);
          if (!set) return;
          for (const fn of Array.from(set)) {
            fn(...args);
          }
        };

        const socketLike: IPeerSocketLike = {
          send(data: unknown) {
            if (ws.readyState === WebSocketCtor.OPEN) {
              ws.send(JSON.stringify(data));
            }
          },
          on(ev: string, listener: (data: unknown) => void) {
            let set = socketListeners.get(ev);
            if (!set) {
              set = new Set();
              socketListeners.set(ev, set);
            }
            set.add(listener);
            return this;
          },
        };

        ws.on('message', (raw: unknown) => {
          const text = String(raw);
          const msg = JSON.parse(text) as {
            type?: string;
            src?: string;
            payload?: { msg?: string };
          };
          const msgSet = socketListeners.get('message');
          if (msgSet) {
            for (const fn of Array.from(msgSet)) {
              fn(msg);
            }
          }
          if (msg.type === 'OPEN') {
            emitPeer('open', peerId);
          } else if (msg.type === 'ID-TAKEN') {
            const err = new Error(`ID "${peerId}" is taken`) as Error & {
              type?: string;
            };
            err.type = 'unavailable-id';
            emitPeer('error', err);
          } else if (msg.type === 'EXPIRE') {
            const err = new Error(
              `Could not connect to peer ${msg.src ?? ''}`
            ) as Error & { type?: string };
            err.type = 'peer-unavailable';
            emitPeer('error', err);
          }
        });

        ws.on('close', () => {
          if (!peerObj.destroyed) {
            peerObj.disconnected = true;
            emitPeer('disconnected', peerId);
          }
        });

        const peerObj: IPeerLike & {
          destroyed: boolean;
          disconnected: boolean;
        } = {
          id: peerId,
          destroyed: false,
          disconnected: false,
          socket: socketLike,
          connect(targetId: string) {
            // Stalled WebRTC connection (never opens, forcing WS relay)
            return {
              peer: targetId,
              open: false,
              send() {},
              close() {},
              on() {
                return this;
              },
            };
          },
          destroy() {
            this.destroyed = true;
            this.disconnected = true;
            ws.close();
            emitPeer('close');
          },
          disconnect() {
            this.disconnected = true;
            ws.close();
            emitPeer('disconnected', peerId);
          },
          on(ev: string, listener: (...args: never[]) => void) {
            let set = peerListeners.get(ev);
            if (!set) {
              set = new Set();
              peerListeners.set(ev, set);
            }
            set.add(listener as (...args: unknown[]) => void);
            return this;
          },
        };

        return peerObj;
      };
    };

    const factory = createWsBackedPeerFactory();
    const hostManager = new PeerManager({
      peerFactory: factory,
      relayFallbackDelayMs: 10,
      pingIntervalMs: 60000,
    });
    const clientManager = new PeerManager({
      peerFactory: factory,
      relayFallbackDelayMs: 10,
      pingIntervalMs: 60000,
    });
    cleanups.push(async () => {
      hostManager.disconnect();
      clientManager.disconnect();
    });

    const code = await hostManager.hostRoom('RELAY');
    await clientManager.joinRoom(code);

    expect(hostManager.getConnectionState()).toBe('connected');
    expect(clientManager.getConnectionState()).toBe('connected');
    expect(hostManager.isUsingRelay()).toBe(true);
    expect(clientManager.isUsingRelay()).toBe(true);

    const engine = new GameEngine(42);
    let receivedStates = 0;
    let receivedInputs = 0;

    clientManager.onPacket((pkt) => {
      if (pkt.type === 'state') {
        receivedStates++;
      }
    });
    hostManager.onPacket((pkt) => {
      if (pkt.type === 'input') {
        receivedInputs++;
      }
    });

    const neutralInput = createDefaultPlayerInput();

    // Send 400 full simulation ticks (~6.6 seconds of 60Hz gameplay, exceeding 0.peerjs.com's 240-msg cap)
    const totalTicks = 400;
    for (let t = 1; t <= totalTicks; t++) {
      const state = engine.tick(16.6667, neutralInput, neutralInput);
      hostManager.sendPacket({
        type: 'state',
        hostTick: state.tick,
        lastProcessedClientTick: t,
        state,
      });
      clientManager.sendPacket({
        type: 'input',
        playerId: 2,
        clientTick: t,
        input: neutralInput,
      });
    }

    // Wait for all WebSocket frames to drain under parallel test load
    const deadline = Date.now() + 5000;
    while (
      (receivedStates < totalTicks || receivedInputs < totalTicks) &&
      Date.now() < deadline
    ) {
      await new Promise((r) => setTimeout(r, 25));
    }

    expect(hostManager.getConnectionState()).toBe('connected');
    expect(clientManager.getConnectionState()).toBe('connected');
    expect(receivedStates).toBe(totalTicks);
    expect(receivedInputs).toBe(totalTicks);

    hostManager.disconnect();
    clientManager.disconnect();
  });
});
