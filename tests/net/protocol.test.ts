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
});
