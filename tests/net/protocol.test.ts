import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  PEER_ID_PREFIX,
  ROOM_CODE_ALPHABET,
  generateRoomCode,
  normalizeRoomCode,
  isValidRoomCode,
  roomCodeToPeerId,
  peerIdToRoomCode,
  getRoomCodeFromUrl,
  buildInviteUrl,
  InputSequenceTracker,
  EventDeduplicator,
  isValidNetPacket,
  serializePacket,
  deserializePacket,
} from '../../src/net/protocol';
import {
  PeerManager,
  InMemoryPeerBus,
  DEFAULT_ICE_SERVERS,
  DEFAULT_JOIN_TIMEOUT_MS,
  buildIceServers,
  IPeerLike,
  IDataConnectionLike,
} from '../../src/net/peerManager';
import {
  ConnectionState,
  GameEvent,
  GameState,
  InputPacket,
  LobbySyncPacket,
  NetPacket,
  PingPongPacket,
  StatePacket,
  createDefaultLobbyConfig,
  createDefaultPlayerInput,
} from '../../src/shared/types';
import { GameEngine } from '../../src/core/gameEngine';

function createMinimalGameState(overrides: Partial<GameState> = {}): GameState {
  const emptySide = {
    world: 'neutral' as const,
    cells: [],
    doors: [],
    boxes: [],
    lamps: [],
    evilLamps: [],
    pressurePlates: [],
    levers: [],
    chests: [],
    safes: [],
    fires: [],
    statues: [],
    books: [],
    items: [],
    blobbies: [],
  };
  return {
    tick: 1,
    nextEventId: 1,
    rngState: 12345,
    roomName: 'spawnRoom',
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
    convergenceDistance: 10,
    safePressurePlatesPressed: 0,
    isPaused: false,
    phase: 'playing',
    phaseTimerMs: 0,
    lobbyConfig: createDefaultLobbyConfig(),
    room: {
      roomName: 'spawnRoom',
      worlds: {
        neutral: emptySide,
        dangerous: { ...emptySide, world: 'dangerous' },
      },
      tears: [],
      pendingRegrowths: [],
      blobbySpawnTimerMs: 0,
      chestPressurePlatesToPress: 0,
      chestPressurePlatesPressed: 0,
      swooshTriggered: false,
    },
    players: [
      {
        id: 1,
        side: 'left',
        x: 100,
        y: 100,
        velocity: { x: 0, y: 0 },
        direction: 7,
        flashLightDir: 7,
        speed: 2,
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
          direction: 0,
          hasDealtKnockback: false,
        },
        interactingObjectId: null,
        activePopupText: null,
        popupFaceDirection: 0,
        atDoorId: null,
        ping: null,
      },
      {
        id: 2,
        side: 'right',
        x: 200,
        y: 200,
        velocity: { x: 0, y: 0 },
        direction: 7,
        flashLightDir: 7,
        speed: 2,
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
          direction: 0,
          hasDealtKnockback: false,
        },
        interactingObjectId: null,
        activePopupText: null,
        popupFaceDirection: 0,
        atDoorId: null,
        ping: null,
      },
    ],
    persistence: {},
    events: [],
    ...overrides,
  };
}

describe('Room Code & URL Utilities (protocol.ts)', () => {
  it('generates unambiguous 5-character uppercase room codes omitting 0, O, 1, I', () => {
    expect(ROOM_CODE_ALPHABET).not.toContain('0');
    expect(ROOM_CODE_ALPHABET).not.toContain('O');
    expect(ROOM_CODE_ALPHABET).not.toContain('1');
    expect(ROOM_CODE_ALPHABET).not.toContain('I');

    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(5);
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{5}$/);
    }

    const customLen = generateRoomCode(7);
    expect(customLen).toHaveLength(7);
  });

  it('normalizes room codes with whitespace, SHIFT- prefixes, and peer ID prefixes', () => {
    expect(normalizeRoomCode('  k7m9p ')).toBe('K7M9P');
    expect(normalizeRoomCode('SHIFT-K7M9P')).toBe('K7M9P');
    expect(normalizeRoomCode('  shift-k7m9p  ')).toBe('K7M9P');
    expect(normalizeRoomCode('shift_k7m9p')).toBe('K7M9P');
    expect(normalizeRoomCode('shift-game-room-k7m9p')).toBe('K7M9P');
    expect(normalizeRoomCode('K7M-9P')).toBe('K7M9P');
  });

  it('validates room codes and maps deterministically to/from PeerJS IDs', () => {
    expect(isValidRoomCode('K7M9P')).toBe(true);
    expect(isValidRoomCode('shift-k7m9p')).toBe(true);
    expect(isValidRoomCode('AB')).toBe(false);
    expect(isValidRoomCode('')).toBe(false);

    const peerId = roomCodeToPeerId('SHIFT-K7M9P');
    expect(peerId).toBe(`${PEER_ID_PREFIX}k7m9p`);
    expect(peerIdToRoomCode(peerId)).toBe('K7M9P');
    expect(peerIdToRoomCode('unrelated-peer-id')).toBeNull();
  });

  it('extracts room codes from URL query strings and constructs shareable invite URLs', () => {
    expect(getRoomCodeFromUrl('?room=k7m9p')).toBe('K7M9P');
    expect(getRoomCodeFromUrl('?foo=bar&room=SHIFT-A2B3C')).toBe('A2B3C');
    expect(getRoomCodeFromUrl('https://bazzite.tail80acff.ts.net:5173/?room=x9y8z#menu')).toBe('X9Y8Z');
    expect(getRoomCodeFromUrl('?room=')).toBeNull();
    expect(getRoomCodeFromUrl('?other=123')).toBeNull();
    expect(getRoomCodeFromUrl('')).toBeNull();

    const invite = buildInviteUrl('https://bazzite.tail80acff.ts.net:5173/', 'shift-k7m9p');
    expect(invite).toBe('https://bazzite.tail80acff.ts.net:5173/?room=K7M9P');
    expect(getRoomCodeFromUrl(invite)).toBe('K7M9P');
  });
});

describe('InputSequenceTracker (protocol.ts)', () => {
  it('delivers discrete sequence increments one-by-one across ticks without dropping clumped packets or double-firing', () => {
    const tracker = new InputSequenceTracker();

    // Initially returns default input
    const initial = tracker.consumeForTick();
    expect(initial).toEqual(createDefaultPlayerInput());
    expect(tracker.getLastClientTick()).toBe(0);

    // Suppose two packets clump together before the next Host tick:
    // Packet 1 (tick 10): player moves up, presses interact (seq 1), cycles inventory (seq 1), and pings 'here' (seq 1)
    const packet1: InputPacket = {
      type: 'input',
      playerId: 2,
      clientTick: 10,
      input: {
        ...createDefaultPlayerInput(),
        up: true,
        interactSeq: 1,
        inventoryCycleSeq: 1,
        pingSeq: 1,
        pingKind: 'here',
      },
    };

    // Packet 2 (tick 11): player releases up, moves right, cycles inventory again (seq 2)
    const packet2: InputPacket = {
      type: 'input',
      playerId: 2,
      clientTick: 11,
      input: {
        ...createDefaultPlayerInput(),
        up: false,
        right: true,
        interactSeq: 1,
        inventoryCycleSeq: 2,
        pingSeq: 1,
      },
    };

    tracker.receivePacket(packet1);
    tracker.receivePacket(packet2);

    expect(tracker.getLastClientTick()).toBe(11);
    expect(tracker.hasPendingActions()).toBe(true);

    // Host Tick 1: gets latest directional keys (up: false, right: true),
    // interactSeq steps 0 -> 1, inventoryCycleSeq steps 0 -> 1, pingSeq steps 0 -> 1 with pingKind 'here'
    const tick1Input = tracker.consumeForTick();
    expect(tick1Input.up).toBe(false);
    expect(tick1Input.right).toBe(true);
    expect(tick1Input.interactSeq).toBe(1);
    expect(tick1Input.inventoryCycleSeq).toBe(1);
    expect(tick1Input.pingSeq).toBe(1);
    expect(tick1Input.pingKind).toBe('here');
    expect(tracker.hasPendingActions()).toBe(true); // inventoryCycleSeq still has 1 -> 2 pending!

    // Host Tick 2: inventoryCycleSeq steps 1 -> 2, interactSeq stays 1, pingSeq stays 1
    const tick2Input = tracker.consumeForTick();
    expect(tick2Input.interactSeq).toBe(1);
    expect(tick2Input.inventoryCycleSeq).toBe(2);
    expect(tick2Input.pingSeq).toBe(1);
    expect(tracker.hasPendingActions()).toBe(false);

    // Host Tick 3 (no new network packets): sequence numbers remain stable at their delivered values (no double-firing)
    const tick3Input = tracker.consumeForTick();
    expect(tick3Input.interactSeq).toBe(1);
    expect(tick3Input.inventoryCycleSeq).toBe(2);
    expect(tick3Input.pingSeq).toBe(1);
  });

  it('ignores out-of-order stale directional inputs while preserving monotonic sequence counters', () => {
    const tracker = new InputSequenceTracker();

    tracker.receivePacket({
      type: 'input',
      playerId: 2,
      clientTick: 20,
      input: {
        ...createDefaultPlayerInput(),
        left: true,
        useItemSeq: 3,
      },
    });

    // Stale packet from tick 18 arrives late with left: false, down: true, useItemSeq: 2
    tracker.receivePacket({
      type: 'input',
      playerId: 2,
      clientTick: 18,
      input: {
        ...createDefaultPlayerInput(),
        left: false,
        down: true,
        useItemSeq: 2,
      },
    });

    expect(tracker.getLastClientTick()).toBe(20);
    const consumed = tracker.consumeForTick();
    expect(consumed.left).toBe(true);
    expect(consumed.down).toBe(false);
    expect(consumed.useItemSeq).toBe(1);
  });

  it('queues distinct pingKind values across multiple clumped pingSeq increments and supports reset()', () => {
    const tracker = new InputSequenceTracker();

    tracker.pushInput(
      {
        ...createDefaultPlayerInput(),
        pingSeq: 1,
        pingKind: 'action',
      },
      1
    );
    tracker.pushInput(
      {
        ...createDefaultPlayerInput(),
        pingSeq: 2,
        pingKind: 'wait',
      },
      2
    );

    const first = tracker.consumeForTick();
    expect(first.pingSeq).toBe(1);
    expect(first.pingKind).toBe('action');

    const second = tracker.consumeForTick();
    expect(second.pingSeq).toBe(2);
    expect(second.pingKind).toBe('wait');

    expect(tracker.getDeliveredInput().pingSeq).toBe(2);

    tracker.reset();
    expect(tracker.getLastClientTick()).toBe(0);
    expect(tracker.getDeliveredInput()).toEqual(createDefaultPlayerInput());
  });
});

describe('EventDeduplicator (protocol.ts)', () => {
  it('filters out already-processed GameEvents and only returns new events in ascending order', () => {
    const dedup = new EventDeduplicator();
    expect(dedup.getLastProcessedEventId()).toBe(0);

    const batch1: GameEvent[] = [
      { eventId: 2, type: 'flashScreen', color: '#ff0000', durationMs: 300 },
      { eventId: 1, type: 'playSound', sound: 'itemPickup', side: 'left' },
      { eventId: 2, type: 'flashScreen', color: '#ff0000', durationMs: 300 },
    ];

    const new1 = dedup.filterNewEvents(batch1);
    expect(new1).toHaveLength(2);
    expect(new1.map((e) => e.eventId)).toEqual([1, 2]);
    expect(dedup.getLastProcessedEventId()).toBe(2);

    // Next StatePacket still includes events 1 and 2 plus new event 3
    const stateSnapshot = createMinimalGameState({
      events: [
        { eventId: 1, type: 'playSound', sound: 'itemPickup', side: 'left' },
        { eventId: 2, type: 'flashScreen', color: '#ff0000', durationMs: 300 },
        { eventId: 3, type: 'dimensionShifted' },
      ],
    });

    const new2 = dedup.extractFromState(stateSnapshot);
    expect(new2).toHaveLength(1);
    expect(new2[0].eventId).toBe(3);
    expect(dedup.getLastProcessedEventId()).toBe(3);

    // Duplicate packet re-delivery returns empty array
    expect(dedup.extractNewEvents(stateSnapshot.events)).toEqual([]);

    // Resetting allows fresh game session events from 1
    dedup.reset();
    expect(dedup.getLastProcessedEventId()).toBe(0);
    expect(dedup.filterNewEvents(batch1)).toHaveLength(2);
  });
});

describe('Packet Serialization & Validation (protocol.ts)', () => {
  it('serializes, validates, and deserializes all NetPacket types safely (including binary buffers)', () => {
    const inputPkt: InputPacket = {
      type: 'input',
      playerId: 2,
      clientTick: 42,
      input: {
        ...createDefaultPlayerInput(),
        up: true,
        shiftRequestSeq: 1,
      },
    };
    const statePkt: StatePacket = {
      type: 'state',
      hostTick: 100,
      lastProcessedClientTick: 42,
      state: createMinimalGameState({ tick: 100 }),
    };
    const lobbyPkt: LobbySyncPacket = {
      type: 'lobbySync',
      lobbyConfig: {
        mode: 'online',
        partnerVisibility: 'echo',
        shiftMode: 'cooperative',
        muffledCrossDimensionAudio: true,
      },
      hostReady: true,
      clientReady: false,
      startGame: false,
    };
    const pingPkt: PingPongPacket = {
      type: 'ping',
      timestamp: 123456.78,
    };

    for (const pkt of [inputPkt, statePkt, lobbyPkt, pingPkt]) {
      expect(isValidNetPacket(pkt)).toBe(true);
      const raw = serializePacket(pkt);
      expect(typeof raw).toBe('string');
      const parsed = deserializePacket(raw);
      expect(parsed).toEqual(pkt);
      // Also works if PeerJS already parsed the JSON object
      expect(deserializePacket(pkt)).toEqual(pkt);
      // Also works with Uint8Array and ArrayBuffer
      const encoded = new TextEncoder().encode(raw);
      expect(deserializePacket(encoded)).toEqual(pkt);
      expect(deserializePacket(encoded.buffer)).toEqual(pkt);
    }

    // Rejects malformed packets
    expect(deserializePacket('not-valid-json{{{')).toBeNull();
    expect(deserializePacket({ type: 'unknown' })).toBeNull();
    expect(deserializePacket({ type: 'input', playerId: 99, clientTick: 1, input: {} })).toBeNull();
    expect(deserializePacket(null)).toBeNull();
  });
});

describe('PeerManager P2P Handshake, Sync, Ping/Pong RTT & Disconnect (peerManager.ts)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('completes Host <-> Client handshake, exchanges LobbySync/Input/State packets, measures RTT, and handles disconnect', async () => {
    let currentTimeMs = 1000;
    const now = () => currentTimeMs;
    const bus = new InMemoryPeerBus();

    const hostStates: ConnectionState[] = [];
    const clientStates: ConnectionState[] = [];
    const hostReceived: NetPacket[] = [];
    const clientReceived: NetPacket[] = [];

    const host = new PeerManager({
      peerFactory: bus.createPeerFactory(),
      pingIntervalMs: 2000,
      now,
    });
    const client = new PeerManager({
      peerFactory: bus.createPeerFactory(),
      pingIntervalMs: 2000,
      now,
    });

    host.onStateChange((st) => hostStates.push(st));
    client.onStateChange((st) => clientStates.push(st));
    host.onPacket((pkt) => hostReceived.push(pkt));
    client.onPacket((pkt) => clientReceived.push(pkt));

    // 1. Host opens room with custom code
    const roomCode = await host.hostRoom('shift-k7m9p');
    expect(roomCode).toBe('K7M9P');
    expect(host.getRoomCode()).toBe('K7M9P');
    expect(host.getConnectionState()).toBe('hosting');

    // 2. Client joins using lowercase/prefixed code
    await client.joinRoom('  shift-k7m9p ');
    expect(client.getRoomCode()).toBe('K7M9P');
    expect(client.getConnectionState()).toBe('connected');
    expect(host.getConnectionState()).toBe('connected');

    expect(hostStates).toEqual(['hosting', 'connected']);
    expect(clientStates).toEqual(['joining', 'connected']);

    // 3. Exchange LobbySyncPacket (Host -> Client)
    const lobbyPacket: LobbySyncPacket = {
      type: 'lobbySync',
      lobbyConfig: {
        mode: 'online',
        partnerVisibility: 'strict',
        shiftMode: 'cooperative',
        muffledCrossDimensionAudio: true,
      },
      hostReady: true,
      clientReady: true,
      startGame: true,
    };
    host.sendPacket(lobbyPacket);

    expect(clientReceived.some((p) => p.type === 'lobbySync' && p.startGame)).toBe(true);

    // 4. Exchange InputPacket (Client -> Host) and StatePacket (Host -> Client)
    const inputPacket: InputPacket = {
      type: 'input',
      playerId: 2,
      clientTick: 5,
      input: {
        ...createDefaultPlayerInput(),
        right: true,
        interactSeq: 1,
      },
    };
    client.sendPacket(inputPacket);
    expect(
      hostReceived.some(
        (p) => p.type === 'input' && p.clientTick === 5 && p.input.interactSeq === 1
      )
    ).toBe(true);

    const statePacket: StatePacket = {
      type: 'state',
      hostTick: 12,
      lastProcessedClientTick: 5,
      state: createMinimalGameState({ tick: 12 }),
    };
    host.sendPacket(statePacket);
    expect(
      clientReceived.some(
        (p) => p.type === 'state' && p.hostTick === 12 && p.lastProcessedClientTick === 5
      )
    ).toBe(true);

    // 5. RTT measurement via periodic ping/pong
    currentTimeMs = 1000;
    // Configure simulated 35ms one-way latency on the bus (70ms RTT) or advance time before pong
    bus.setLatencyMs(24);
    vi.advanceTimersByTime(2000);
    // Advance clock and timers for ping (24ms) + pong (24ms)
    currentTimeMs += 24;
    vi.advanceTimersByTime(24);
    currentTimeMs += 24;
    vi.advanceTimersByTime(24);

    expect(host.getRttMs()).toBe(48);
    expect(client.getRttMs()).toBe(48);

    // 6. Clean disconnect propagates to partner
    client.disconnect();
    expect(client.getConnectionState()).toBe('disconnected');
    expect(client.getRoomCode()).toBeNull();
    expect(host.getConnectionState()).toBe('disconnected');

    host.disconnect();
  });

  it('transitions to error state when joining a non-existent room', async () => {
    const bus = new InMemoryPeerBus();
    const client = new PeerManager(bus.createPeerFactory());
    const errors: Array<{ state: ConnectionState; error?: string }> = [];
    client.onStateChange((state, error) => errors.push({ state, error }));

    await expect(client.joinRoom('ZZZZZ')).rejects.toThrow();
    expect(client.getConnectionState()).toBe('error');
    expect(errors.some((e) => e.state === 'error' && Boolean(e.error))).toBe(true);
  });

  it('auto-generates a valid room code when hostRoom() is called without arguments and rejects duplicate room IDs or invalid codes', async () => {
    const bus = new InMemoryPeerBus();
    const host1 = new PeerManager(bus.createPeerFactory());
    const host2 = new PeerManager(bus.createPeerFactory());

    const generatedCode = await host1.hostRoom();
    expect(generatedCode).toHaveLength(5);
    expect(host1.getRoomCode()).toBe(generatedCode);

    // Attempting to host the exact same room code while host1 is active fails with error
    await expect(host2.hostRoom(generatedCode)).rejects.toThrow();
    expect(host2.getConnectionState()).toBe('error');

    // Invalid short room code
    await expect(host2.hostRoom('!')).rejects.toThrow();
    await expect(host2.joinRoom('!')).rejects.toThrow();

    host1.disconnect();
    host2.disconnect();
  });

  it('provides clean default STUN servers (without dead turn.peerjs.com hosts) and builds TURN iceServers from env or options', () => {
    expect(DEFAULT_ICE_SERVERS.length).toBeGreaterThanOrEqual(3);
    const serializedDefaults = JSON.stringify(DEFAULT_ICE_SERVERS);
    expect(serializedDefaults).toContain('stun:stun.l.google.com:19302');
    expect(serializedDefaults).toContain('stun:stun.cloudflare.com:3478');
    expect(serializedDefaults).not.toContain('turn.peerjs.com');

    // Builds TURN server entries when VITE_TURN_URLS is provided
    const withTurn = buildIceServers({
      VITE_TURN_URLS:
        'turn:global.relay.metered.ca:80, turns:global.relay.metered.ca:443?transport=tcp',
      VITE_TURN_USERNAME: 'turnuser',
      VITE_TURN_CREDENTIAL: 'turnpass',
    });
    expect(withTurn).toEqual([
      ...DEFAULT_ICE_SERVERS,
      {
        urls: [
          'turn:global.relay.metered.ca:80',
          'turns:global.relay.metered.ca:443?transport=tcp',
        ],
        username: 'turnuser',
        credential: 'turnpass',
      },
    ]);

    // Supports VITE_ICE_SERVERS JSON array
    const fromJson = buildIceServers({
      VITE_ICE_SERVERS: JSON.stringify([
        {
          urls: 'turns:custom.turn.example.com:443',
          username: 'u',
          credential: 'p',
        },
      ]),
    });
    expect(fromJson).toEqual([
      ...DEFAULT_ICE_SERVERS,
      {
        urls: 'turns:custom.turn.example.com:443',
        username: 'u',
        credential: 'p',
      },
    ]);

    // Passes RTCConfiguration with iceServers into peerFactory
    const spyFactory = vi.fn(new InMemoryPeerBus().createPeerFactory());
    const customIce = [{ urls: 'stun:custom.stun.example:3478' }];
    const mgr = new PeerManager({
      peerFactory: spyFactory,
      iceServers: customIce,
    });
    void mgr.hostRoom('K7M9P');
    expect(spyFactory).toHaveBeenCalledWith(
      'shift-game-room-k7m9p',
      expect.objectContaining({
        config: expect.objectContaining({
          iceServers: customIce,
        }),
      })
    );
    mgr.disconnect();
  });

  it('ignores non-fatal mobile WebRTC ICE candidate errors (type: "webrtc") during handshake and gameplay', async () => {
    const bus = new InMemoryPeerBus();
    const host = new PeerManager(bus.createPeerFactory());
    const client = new PeerManager(bus.createPeerFactory());

    const hostStates: ConnectionState[] = [];
    const clientStates: ConnectionState[] = [];
    host.onStateChange((st) => hostStates.push(st));
    client.onStateChange((st) => clientStates.push(st));

    await host.hostRoom('MBL01');

    // Simulate mobile PeerJS emitting non-fatal 'webrtc' error when one interface ICE candidate fails
    const hostPeer = bus.getPeer('shift-game-room-mbl01')!;
    const webrtcErr = new Error(
      'OperationError: Failed to execute addIceCandidate'
    ) as Error & { type?: string };
    webrtcErr.type = 'webrtc';
    hostPeer.emitPeerError(webrtcErr);

    // Host must remain in 'hosting' state and not transition to 'error'
    expect(host.getConnectionState()).toBe('hosting');
    expect(hostStates).toEqual(['hosting']);

    await client.joinRoom('MBL01');
    expect(host.getConnectionState()).toBe('connected');
    expect(client.getConnectionState()).toBe('connected');

    // Emitting a late 'webrtc' candidate error while connected must not drop the connection
    hostPeer.emitPeerError(webrtcErr);
    expect(host.getConnectionState()).toBe('connected');

    host.disconnect();
    client.disconnect();
  });

  it('auto-reconnects signaling socket when mobile Host backgrounds app while hosting, and keeps P2P game alive if signaling drops while connected', async () => {
    const bus = new InMemoryPeerBus();
    const host = new PeerManager(bus.createPeerFactory());
    const client = new PeerManager(bus.createPeerFactory());

    await host.hostRoom('MBL02');
    const hostPeer = bus.getPeer('shift-game-room-mbl02')!;
    const reconnectSpy = vi.spyOn(hostPeer, 'reconnect');

    // Simulate mobile Host switching apps to share invite link:
    // PeerJS emits 'error' (type: 'network') and 'disconnected'
    const netErr = new Error('Lost connection to server.') as Error & {
      type?: string;
    };
    netErr.type = 'network';
    hostPeer.emitPeerError(netErr);
    hostPeer.disconnect();

    expect(reconnectSpy).toHaveBeenCalled();
    expect(host.getConnectionState()).toBe('hosting');

    // Client can still join after Host signaling reconnects
    await client.joinRoom('MBL02');
    expect(host.getConnectionState()).toBe('connected');
    expect(client.getConnectionState()).toBe('connected');

    // Now simulate signaling broker dropping while P2P DataChannel is already open & active:
    // Active P2P connection must stay 'connected', not abort to 'error'!
    hostPeer.emitPeerError(netErr);
    hostPeer.disconnect();
    expect(host.getConnectionState()).toBe('connected');

    host.disconnect();
    client.disconnect();
  });

  it('times out joinRoom() cleanly when WebRTC DataChannel negotiation stalls on restricted mobile NAT', async () => {
    expect(DEFAULT_JOIN_TIMEOUT_MS).toBeGreaterThanOrEqual(5000);

    // Create a peerFactory where Peer opens on signaling server, but DataConnection never opens
    const stallingFactory = (): IPeerLike => {
      let openHandler: ((id: string) => void) | null = null;
      const fakeConn: IDataConnectionLike = {
        peer: 'shift-game-room-stall',
        open: false,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
      };
      const fakePeer: IPeerLike = {
        id: 'client-stall-1',
        destroyed: false,
        disconnected: false,
        connect: vi.fn(() => fakeConn),
        destroy: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
          if (event === 'open') {
            openHandler = cb as (id: string) => void;
          }
          return fakePeer;
        }),
      };
      queueMicrotask(() => {
        openHandler?.('client-stall-1');
      });
      return fakePeer;
    };

    const client = new PeerManager({
      peerFactory: stallingFactory,
      joinTimeoutMs: 3000,
    });
    const states: Array<{ state: ConnectionState; error?: string }> = [];
    client.onStateChange((state, error) => states.push({ state, error }));

    let rejectedError = null as Error | null;
    const joinPromise = client.joinRoom('STALL').catch((err: Error) => {
      rejectedError = err;
    });

    await Promise.resolve();
    expect(client.getConnectionState()).toBe('joining');

    vi.advanceTimersByTime(3100);
    await joinPromise;

    expect(rejectedError).toBeInstanceOf(Error);
    expect(rejectedError?.message).toMatch(/timed out/i);
    expect(client.getConnectionState()).toBe('error');
    expect(states.some((s) => s.state === 'error' && /timed out/i.test(s.error ?? ''))).toBe(true);
  });

  it('automatically falls back to PeerSocket WebSocket relay when WebRTC DataChannel is blocked on mobile NAT', async () => {
    // Simulate a signaling broker where Peer.socket can exchange messages (WSS port 443),
    // but direct WebRTC DataConnection never opens (and later emits negotiation-failed).
    type SocketListener = (data: unknown) => void;
    const sockets = new Map<
      string,
      {
        listeners: Map<string, Set<SocketListener>>;
        send: (data: unknown) => void;
      }
    >();

    const createSocket = (myPeerId: string) => {
      const listeners = new Map<string, Set<SocketListener>>();
      const socketObj = {
        on: vi.fn((event: string, cb: SocketListener) => {
          let set = listeners.get(event);
          if (!set) {
            set = new Set();
            listeners.set(event, set);
          }
          set.add(cb);
          return socketObj;
        }),
        off: vi.fn((event: string, cb: SocketListener) => {
          listeners.get(event)?.delete(cb);
          return socketObj;
        }),
        removeListener: vi.fn((event: string, cb: SocketListener) => {
          listeners.get(event)?.delete(cb);
          return socketObj;
        }),
        send: vi.fn((raw: unknown) => {
          const msg = raw as {
            type?: string;
            dst?: string;
            payload?: unknown;
          };
          if (!msg || !msg.dst) return;
          const target = sockets.get(msg.dst);
          if (!target) return;
          const forwarded = {
            type: msg.type,
            src: myPeerId,
            dst: msg.dst,
            payload: msg.payload,
          };
          queueMicrotask(() => {
            for (const fn of target.listeners.get('message') ?? []) {
              fn(forwarded);
            }
          });
        }),
      };
      sockets.set(myPeerId, { listeners, send: socketObj.send });
      return socketObj;
    };

    let clientWebRtcErrorCb = null as ((err: Error) => void) | null;
    let clientWebRtcCloseCb = null as (() => void) | null;

    const mobileBlockedWebRtcFactory = (requestedId?: string): IPeerLike => {
      const peerId = requestedId ?? 'mobile-client-peer-1';
      let openHandler: ((id: string) => void) | null = null;
      const socket = createSocket(peerId);

      const stalledWebRtcConn: IDataConnectionLike = {
        peer: 'shift-game-room-mbl99',
        open: false,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
          if (event === 'error') clientWebRtcErrorCb = cb as (err: Error) => void;
          if (event === 'close') clientWebRtcCloseCb = cb as () => void;
          return stalledWebRtcConn;
        }),
      };

      const fakePeer: IPeerLike = {
        id: peerId,
        destroyed: false,
        disconnected: false,
        socket,
        connect: vi.fn(() => stalledWebRtcConn),
        destroy: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
          if (event === 'open') {
            openHandler = cb as (id: string) => void;
          }
          return fakePeer;
        }),
      };

      queueMicrotask(() => {
        openHandler?.(peerId);
      });

      return fakePeer;
    };

    let clock = 1000;
    const host = new PeerManager({
      peerFactory: mobileBlockedWebRtcFactory,
      relayFallbackDelayMs: 500,
      now: () => clock,
    });
    const client = new PeerManager({
      peerFactory: mobileBlockedWebRtcFactory,
      relayFallbackDelayMs: 500,
      now: () => clock,
    });

    const code = await host.hostRoom('MBL99');
    expect(code).toBe('MBL99');

    const joinPromise = client.joinRoom('MBL99');
    await Promise.resolve();
    expect(client.getConnectionState()).toBe('joining');

    // Advance past relayFallbackDelayMs (500ms) so WS relay SYN/ACK completes
    vi.advanceTimersByTime(600);
    await Promise.resolve();
    await Promise.resolve();
    await joinPromise;

    expect(host.getConnectionState()).toBe('connected');
    expect(client.getConnectionState()).toBe('connected');
    expect(client.isUsingRelay()).toBe(true);
    expect(host.isUsingRelay()).toBe(true);

    // Verify packets flow bidirectionally over the WebSocket signaling relay,
    // including a full GameEngine StatePacket without exceeding 0.peerjs.com's 64KB frame limit
    const hostReceived: NetPacket[] = [];
    const clientReceived: NetPacket[] = [];
    host.onPacket((pkt) => hostReceived.push(pkt));
    client.onPacket((pkt) => clientReceived.push(pkt));

    host.sendPacket({
      type: 'lobbySync',
      lobbyConfig: createDefaultLobbyConfig(),
      hostReady: true,
      clientReady: false,
      startGame: false,
    });
    await Promise.resolve();
    expect(clientReceived.some((p) => p.type === 'lobbySync')).toBe(true);

    // Send a real full GameEngine StatePacket (which has 20x26 neutral & dangerous cells)
    const engine = new GameEngine();
    const fullState = engine.getState();
    expect(fullState.room.worlds.neutral.cells.length).toBe(20);
    expect(fullState.room.worlds.dangerous.cells.length).toBe(20);

    const rawWireState = serializePacket({
      type: 'state',
      hostTick: 1,
      lastProcessedClientTick: 0,
      state: fullState,
    });
    // Wire payload is compacted from ~272KB down to ~15KB (well below 0.peerjs.com's 64KB limit)
    expect(rawWireState.length).toBeLessThan(20000);

    host.sendPacket({
      type: 'state',
      hostTick: 1,
      lastProcessedClientTick: 0,
      state: fullState,
    });
    await Promise.resolve();
    await Promise.resolve();

    const receivedStatePkt = clientReceived.find(
      (p): p is StatePacket => p.type === 'state'
    );
    expect(receivedStatePkt).toBeDefined();
    expect(receivedStatePkt?.state.room.worlds.neutral.cells.length).toBe(20);
    expect(receivedStatePkt?.state.room.worlds.dangerous.cells.length).toBe(20);

    client.sendPacket({
      type: 'input',
      playerId: 2,
      clientTick: 1,
      input: createDefaultPlayerInput(),
    });
    await Promise.resolve();
    expect(hostReceived.some((p) => p.type === 'input')).toBe(true);

    // Even if the underlying WebRTC attempt later fails ("negotiation-failed") and closes,
    // the active WebSocket relay connection remains connected!
    const webrtcErr = Object.assign(new Error('Negotiation failed'), {
      type: 'negotiation-failed',
    });
    clientWebRtcErrorCb?.(webrtcErr);
    clientWebRtcCloseCb?.();
    expect(client.getConnectionState()).toBe('connected');
    expect(host.getConnectionState()).toBe('connected');

    host.disconnect();
    client.disconnect();
  });
});
