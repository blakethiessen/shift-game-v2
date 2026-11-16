// src/net/peerRelayServer.ts
// Built-in Same-Origin PeerJS Signaling & WebSocket Relay Server for Vite dev/preview.
// Eliminates reliance on 0.peerjs.com's ~240-message quota and 64KB frame limit,
// allowing mobile and desktop players on the same server/Tailnet to play at 60Hz indefinitely.

import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import type { Socket } from 'node:net';
import path from 'node:path';

interface WsClientLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', cb: (data: unknown) => void): void;
  on(event: 'close', cb: () => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
}

interface WsServerLike {
  handleUpgrade(
    request: IncomingMessage,
    socket: Socket,
    head: Buffer,
    callback: (client: WsClientLike, request: IncomingMessage) => void
  ): void;
  close(): void;
}

interface WsModuleLike {
  WebSocketServer: new (options: {
    noServer: boolean;
    maxPayload?: number;
  }) => WsServerLike;
  OPEN: number;
}

const WS_OPEN_STATE = 1;
const DEFAULT_BASE_PATH = '/shift-peerjs';
const MAX_RELAY_PAYLOAD_BYTES = 64 * 1024; // 64 KB
const MAX_PEERS = 1024;
const PEER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const RELAYABLE_CLIENT_MESSAGE_TYPES = new Set([
  'OFFER',
  'ANSWER',
  'CANDIDATE',
  'LEAVE',
]);
const HEARTBEAT_CHECK_INTERVAL_MS = 15_000;
const IDLE_PEER_EVICT_MS = 45_000;

const attachedServers = new WeakSet<object>();

function loadWsModule(): WsModuleLike {
  const req = createRequire(path.join(process.cwd(), 'package.json'));
  return req('ws') as WsModuleLike;
}

interface RegisteredPeer {
  id: string;
  token: string;
  ws: WsClientLike;
  lastSeenMs: number;
}

export function attachPeerRelayServer(
  httpServer: HttpServer,
  basePath: string = DEFAULT_BASE_PATH
): void {
  if (!httpServer || attachedServers.has(httpServer)) {
    return;
  }
  attachedServers.add(httpServer);

  const normalizedBase = basePath.endsWith('/')
    ? basePath.slice(0, -1)
    : basePath;
  const wsEndpointPath = `${normalizedBase}/peerjs`;
  const idEndpointPrefix = `${normalizedBase}/peerjs/id`;

  const wsModule = loadWsModule();
  const wss = new wsModule.WebSocketServer({
    noServer: true,
    maxPayload: MAX_RELAY_PAYLOAD_BYTES,
  });

  const peers = new Map<string, RegisteredPeer>();
  let nextAutoId = 1;

  // Periodic stale/zombie peer reaper so dead mobile sockets release custom room codes promptly
  const reaperTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, peer] of peers.entries()) {
      if (
        peer.ws.readyState !== WS_OPEN_STATE ||
        now - peer.lastSeenMs > IDLE_PEER_EVICT_MS
      ) {
        peers.delete(id);
        try {
          peer.ws.close(1001, 'Idle timeout');
        } catch {
          // Ignore close errors
        }
      }
    }
  }, HEARTBEAT_CHECK_INTERVAL_MS);
  if (typeof (reaperTimer as unknown as { unref?: () => void }).unref === 'function') {
    (reaperTimer as unknown as { unref: () => void }).unref();
  }
  httpServer.once('close', () => {
    clearInterval(reaperTimer);
    for (const peer of peers.values()) {
      try {
        peer.ws.close(1001, 'Server shutting down');
      } catch {
        // Ignore close errors
      }
    }
    peers.clear();
  });

  const handleIdRequest = (
    req: IncomingMessage,
    res: ServerResponse
  ): boolean => {
    if (!req.url || res.writableEnded || res.headersSent) {
      return false;
    }
    const qIdx = req.url.indexOf('?');
    const pathname = qIdx >= 0 ? req.url.slice(0, qIdx) : req.url;
    if (pathname === idEndpointPrefix) {
      const randomSuffix = Math.random().toString(36).slice(2, 10);
      const generatedId = `shift-client-${Date.now().toString(36)}-${nextAutoId++}-${randomSuffix}`;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(generatedId);
      return true;
    }
    return false;
  };

  // Handle HTTP GET /shift-peerjs/peerjs/id requests on raw http.Server (unit tests / standalone Node HTTP)
  httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
    handleIdRequest(req, res);
  });

  // Handle WebSocket Upgrade on /shift-peerjs/peerjs?key=peerjs&id=<id>&token=<token>
  httpServer.on(
    'upgrade',
    (req: IncomingMessage, socket: Socket, head: Buffer) => {
      if (!req.url) {
        return;
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(req.url, 'http://localhost');
      } catch {
        return;
      }

      if (parsedUrl.pathname !== wsEndpointPath) {
        return;
      }

      const peerId = (parsedUrl.searchParams.get('id') ?? '').trim();
      const token = (parsedUrl.searchParams.get('token') ?? '').trim();

      wss.handleUpgrade(req, socket, head, (ws: WsClientLike) => {
        if (!peerId || !PEER_ID_PATTERN.test(peerId)) {
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              payload: { msg: 'Invalid or missing peer id parameter' },
            })
          );
          ws.close(1008, 'Invalid peer id');
          return;
        }

        const existing = peers.get(peerId);
        if (!existing && peers.size >= MAX_PEERS) {
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              payload: { msg: 'Relay server capacity reached' },
            })
          );
          ws.close(1013, 'Server full');
          return;
        }
        if (
          existing &&
          existing.ws.readyState === WS_OPEN_STATE &&
          (!token || existing.token !== token)
        ) {
          ws.send(
            JSON.stringify({
              type: 'ID-TAKEN',
              payload: { msg: `ID "${peerId}" is taken` },
            })
          );
          ws.close(1008, 'ID is taken');
          return;
        }

        if (existing && existing.ws !== ws) {
          try {
            existing.ws.close(1000, 'Replaced by reconnect');
          } catch {
            // Ignore close errors on stale socket
          }
        }

        const entry: RegisteredPeer = {
          id: peerId,
          token,
          ws,
          lastSeenMs: Date.now(),
        };
        peers.set(peerId, entry);

        ws.send(JSON.stringify({ type: 'OPEN' }));

        ws.on('message', (rawData: unknown) => {
          entry.lastSeenMs = Date.now();
          let text: string;
          if (typeof rawData === 'string') {
            text = rawData;
          } else if (Buffer.isBuffer(rawData)) {
            text = rawData.toString('utf8');
          } else if (rawData instanceof ArrayBuffer) {
            text = Buffer.from(rawData).toString('utf8');
          } else {
            text = String(rawData);
          }

          let msg: {
            type?: unknown;
            dst?: unknown;
            payload?: unknown;
          };
          try {
            msg = JSON.parse(text) as {
              type?: unknown;
              dst?: unknown;
              payload?: unknown;
            };
          } catch {
            return;
          }

          if (!msg || typeof msg.type !== 'string') {
            return;
          }

          if (msg.type === 'HEARTBEAT') {
            if (ws.readyState === WS_OPEN_STATE) {
              ws.send(JSON.stringify({ type: 'HEARTBEAT' }));
            }
            return;
          }

          if (typeof msg.dst === 'string' && msg.dst.length > 0) {
            if (!RELAYABLE_CLIENT_MESSAGE_TYPES.has(msg.type)) {
              return;
            }
            const dstId = msg.dst;
            const target = peers.get(dstId);
            if (target && target.ws.readyState === WS_OPEN_STATE) {
              target.ws.send(
                JSON.stringify({
                  type: msg.type,
                  src: peerId,
                  dst: dstId,
                  payload: msg.payload,
                })
              );
            } else if (msg.type !== 'LEAVE' && ws.readyState === WS_OPEN_STATE) {
              ws.send(
                JSON.stringify({
                  type: 'EXPIRE',
                  src: dstId,
                  dst: peerId,
                })
              );
            }
          }
        });

        ws.on('close', () => {
          const current = peers.get(peerId);
          if (current && current.ws === ws) {
            peers.delete(peerId);
          }
        });

        ws.on('error', () => {
          const current = peers.get(peerId);
          if (current && current.ws === ws) {
            peers.delete(peerId);
          }
        });
      });
    }
  );
}

type ConnectMiddlewareServer = {
  httpServer: HttpServer | null;
  middlewares?: {
    use: (
      fn: (
        req: IncomingMessage,
        res: ServerResponse,
        next: () => void
      ) => void
    ) => void;
  };
};

function registerPeerIdMiddleware(
  server: ConnectMiddlewareServer,
  basePath: string
): void {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const idEndpointPath = `${normalizedBase}peerjs/id`;
  let mwAutoId = 1;
  server.middlewares?.use((req, res, next) => {
    if (!req.url || res.writableEnded || res.headersSent) {
      next();
      return;
    }
    const qIdx = req.url.indexOf('?');
    const pathname = qIdx >= 0 ? req.url.slice(0, qIdx) : req.url;
    if (pathname === idEndpointPath) {
      const randomSuffix = Math.random().toString(36).slice(2, 10);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        `shift-client-${Date.now().toString(36)}-mw${mwAutoId++}-${randomSuffix}`
      );
      return;
    }
    next();
  });
}

export function shiftPeerRelayVitePlugin(basePath: string = DEFAULT_BASE_PATH): {
  name: string;
  configureServer(server: ConnectMiddlewareServer): void;
  configurePreviewServer(server: ConnectMiddlewareServer): void;
} {
  return {
    name: 'shift-peer-relay-server',
    configureServer(server) {
      registerPeerIdMiddleware(server, basePath);
      if (server.httpServer) {
        attachPeerRelayServer(server.httpServer, basePath);
      }
    },
    configurePreviewServer(server) {
      registerPeerIdMiddleware(server, basePath);
      if (server.httpServer) {
        attachPeerRelayServer(server.httpServer, basePath);
      }
    },
  };
}
