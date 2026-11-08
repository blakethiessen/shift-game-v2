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
  EntityInterpolator,
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

  it('compacts full GameEngine StatePackets to under 4KB (single frame) and losslessly restores all room entities and dynamic popup texts', () => {
    const engine = new GameEngine(0x5f3759df);
    // Test spawnRoom (has books, doors, statue, lamps, etc.)
    const spawnState = engine.getState();
    // Unlock a door and insert gems into the statue to verify dynamic popUpText restoration
    const blackDoor = spawnState.room.worlds.neutral.doors.find(
      (d) => d.kind === 'BlackDoor'
    );
    expect(blackDoor).toBeDefined();
    if (blackDoor) {
      blackDoor.unlocked = true;
      blackDoor.playerAtDoor = true;
      blackDoor.popUpText = 'The black door is unlocked!';
    }

    const pkt: StatePacket = {
      type: 'state',
      hostTick: spawnState.tick,
      lastProcessedClientTick: 7,
      state: structuredClone(spawnState),
    };

    const raw = serializePacket(pkt);
    // Must be compact (< 4000 chars) so it fits in a single WebRTC / WS frame without chunking
    expect(raw.length).toBeLessThan(4000);

    const restored = deserializePacket(raw) as StatePacket | null;
    expect(restored).not.toBeNull();
    expect(restored!.state).toEqual(pkt.state);

    // Test choiceRoom (has GemStatue, books, doors)
    engine.loadRoom('choiceRoom');
    const choiceState = engine.getState();
    const statue = choiceState.room.worlds.neutral.statues[0];
    expect(statue).toBeDefined();
    if (statue) {
      statue.hasRedGem = true;
      statue.hasBlueGem = true;
      statue.popUpText =
        'A tall, majestic statue. It has 3 gem-shaped slots in its base. A red gem is inserted. A blue gem is inserted.';
    }
    const pktChoice: StatePacket = {
      type: 'state',
      hostTick: choiceState.tick,
      lastProcessedClientTick: 8,
      state: structuredClone(choiceState),
    };
    const rawChoice = serializePacket(pktChoice);
    expect(rawChoice.length).toBeLessThan(4000);
    const restoredChoice = deserializePacket(rawChoice) as StatePacket | null;
    expect(restoredChoice).not.toBeNull();
    expect(restoredChoice!.state).toEqual(pktChoice.state);

    // Also test a room with evilLamps, chests, levers, pressurePlates, fires ('lampMonsterIntro' / 'chestIntro')
    engine.loadRoom('lampMonsterIntro');
    const lampRoomState = engine.getState();
    if (lampRoomState.room.worlds.dangerous.evilLamps[0]) {
      lampRoomState.room.worlds.dangerous.evilLamps[0].stage = 'opening';
      lampRoomState.room.worlds.dangerous.evilLamps[0].timerMs = 320;
      lampRoomState.room.worlds.dangerous.evilLamps[0].isOn = true;
    }
    const pkt2: StatePacket = {
      type: 'state',
      hostTick: lampRoomState.tick,
      lastProcessedClientTick: 8,
      state: structuredClone(lampRoomState),
    };
    const raw2 = serializePacket(pkt2);
    expect(raw2.length).toBeLessThan(4000);
    const restored2 = deserializePacket(raw2) as StatePacket | null;
    expect(restored2).not.toBeNull();
    expect(restored2!.state).toEqual(pkt2.state);

    engine.loadRoom('chestIntro');
    const chestRoomState = engine.getState();
    if (chestRoomState.room.worlds.neutral.chests[0]) {
      chestRoomState.room.worlds.neutral.chests[0].opened = true;
      chestRoomState.room.worlds.neutral.chests[0].used = true;
    }
    if (chestRoomState.room.worlds.neutral.pressurePlates[0]) {
      chestRoomState.room.worlds.neutral.pressurePlates[0].touched = true;
    }
    if (chestRoomState.room.worlds.neutral.levers[0]) {
      chestRoomState.room.worlds.neutral.levers[0].activated = true;
    }
    if (chestRoomState.room.worlds.neutral.fires[0]) {
      chestRoomState.room.worlds.neutral.fires[0].isOn = false;
      chestRoomState.room.worlds.neutral.fires[0].damageTimerMs = 450;
    }
    const pkt3: StatePacket = {
      type: 'state',
      hostTick: chestRoomState.tick,
      lastProcessedClientTick: 9,
      state: structuredClone(chestRoomState),
    };
    const raw3 = serializePacket(pkt3);
    expect(raw3.length).toBeLessThan(4000);
    const restored3 = deserializePacket(raw3) as StatePacket | null;
    expect(restored3).not.toBeNull();
    expect(restored3!.state).toEqual(pkt3.state);
  });

  it('validates and round-trips InputPacket with clientState (and rejects malformed clientState)', () => {
    const validInputWithClientState: InputPacket = {
      type: 'input',
      playerId: 2,
      clientTick: 15,
      input: {
        ...createDefaultPlayerInput(),
        right: true,
      },
      clientState: {
        roomName: 'spawnRoom',
        roomsEntered: 1,
        evilOnLeft: false,
        ackHostTick: 12,
        x: 245.5,
        y: 325,
        velocity: { x: 2, y: 0 },
        direction: 5,
        flashLightDir: 5,
        isMoving: true,
        boxColliding: false,
      },
    };

    expect(isValidNetPacket(validInputWithClientState)).toBe(true);
    const raw = serializePacket(validInputWithClientState);
    const parsed = deserializePacket(raw);
    expect(parsed).toEqual(validInputWithClientState);

    const invalidClientState = {
      ...validInputWithClientState,
      clientState: {
        ...validInputWithClientState.clientState,
        x: 'not-a-number',
      },
    };
    expect(isValidNetPacket(invalidClientState)).toBe(false);
    expect(deserializePacket(JSON.stringify(invalidClientState))).toBeNull();
  });

  it('smoothly interpolates remote entities across render frames without mutating GameState after restore()', () => {
    const interpolator = new EntityInterpolator();
    const engine = new GameEngine(0x5f3759df);
    const state = engine.getState();

    // Add a Blobby to dangerous world
    state.room.worlds.dangerous.blobbies.push({
      id: 'blobby_1',
      world: 'dangerous',
      x: 100,
      y: 100,
      velocity: { x: 1, y: 0 },
      direction: 5,
      state: 'Seeking',
      currentSpeed: 1,
      wanderTimerTicks: 0,
      wanderIntervalTicks: 40,
      eatingTimerTicks: 0,
      path: [],
      nextStepIdx: 0,
      nextStep: null,
      oldTargetCoord: { x: 4, y: 4 },
    });

    // Initial target snapshot on Client (localPlayerId = 2, so Player 1 is remote)
    state.players[0].x = 200;
    state.players[0].y = 300;
    interpolator.recordSnapshot(state, 2);

    // Next snapshot moves remote Player 1 to 220 and Blobby to 116 (within 50px teleport threshold)
    state.players[0].x = 220;
    state.players[0].y = 300;
    state.room.worlds.dangerous.blobbies[0].x = 116;
    interpolator.recordSnapshot(state, 2);

    // Apply for render (16.67ms frame): remote entities should be between old (200, 100) and target (220, 116),
    // while local Player 2 is untouched
    const p2OriginalX = state.players[1].x;
    const restore = interpolator.applyToStateForRender(state, 2, 16.67);
    const renderedP1X = state.players[0].x;
    const renderedBlobbyX = state.room.worlds.dangerous.blobbies[0].x;

    expect(renderedP1X).toBeGreaterThan(200);
    expect(renderedP1X).toBeLessThan(220);
    expect(renderedBlobbyX).toBeGreaterThan(100);
    expect(renderedBlobbyX).toBeLessThan(116);
    expect(state.players[1].x).toBe(p2OriginalX);

    // Calling restore() MUST restore exact simulation coordinates on state!
    restore();
    expect(state.players[0].x).toBe(220);
    expect(state.room.worlds.dangerous.blobbies[0].x).toBe(116);

    // Teleport > 50px snaps immediately without lagging behind
    state.players[0].x = 400;
    interpolator.recordSnapshot(state, 2);
    const restoreAfterTeleport = interpolator.applyToStateForRender(state, 2, 16.67);
    expect(state.players[0].x).toBe(400);
    restoreAfterTeleport();
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

  it('automatically falls back to cloud PeerServer (useCloudServer: true) without flashing error when same-origin signaling fails before open with "Lost connection to server."', async () => {
    const bus = new InMemoryPeerBus();
    const cloudFactory = bus.createPeerFactory();
    const factoryCalls: Array<{ id?: string; useCloudServer?: boolean }> = [];

    const fallbackFactory = (
      id?: string,
      options?: { useCloudServer?: boolean }
    ): IPeerLike => {
      factoryCalls.push({ id, useCloudServer: options?.useCloudServer });
      if (!options?.useCloudServer) {
        // Simulate static host where /shift-peerjs/peerjs WebSocket immediately closes before open,
        // causing PeerJS to emit error(type='network', 'Lost connection to server.') and disconnect.
        let errorHandler: ((err: Error & { type?: string }) => void) | null = null;
        let disconnectedHandler: ((currentId: string) => void) | null = null;
        const failedPeer: IPeerLike = {
          id: id ?? 'failed-same-origin-peer',
          destroyed: false,
          disconnected: false,
          connect: vi.fn(),
          destroy: vi.fn(function (this: { destroyed: boolean }) {
            this.destroyed = true;
          }),
          disconnect: vi.fn(function (this: { disconnected: boolean }) {
            this.disconnected = true;
          }),
          on: vi.fn((event: string, cb: (...args: any[]) => void) => {
            if (event === 'error') {
              errorHandler = cb as (err: Error & { type?: string }) => void;
            } else if (event === 'disconnected') {
              disconnectedHandler = cb as (currentId: string) => void;
            }
            return failedPeer;
          }),
        };
        queueMicrotask(() => {
          if (failedPeer.destroyed) return;
          const err = new Error('Lost connection to server.') as Error & {
            type?: string;
          };
          err.type = 'network';
          errorHandler?.(err);
          (failedPeer as { disconnected: boolean }).disconnected = true;
          disconnectedHandler?.(failedPeer.id);
        });
        return failedPeer;
      }
      return cloudFactory(id, options);
    };

    const host = new PeerManager(fallbackFactory);
    const client = new PeerManager(fallbackFactory);

    const hostStates: Array<{ state: ConnectionState; error?: string }> = [];
    const clientStates: Array<{ state: ConnectionState; error?: string }> = [];
    host.onStateChange((state, error) => hostStates.push({ state, error }));
    client.onStateChange((state, error) => clientStates.push({ state, error }));

    const code = await host.hostRoom('CLD01');
    expect(code).toBe('CLD01');
    expect(host.getConnectionState()).toBe('hosting');
    // Must never emit 'error' state during transparent fallback
    expect(hostStates.some((s) => s.state === 'error')).toBe(false);

    await client.joinRoom('CLD01');
    expect(host.getConnectionState()).toBe('connected');
    expect(client.getConnectionState()).toBe('connected');
    expect(clientStates.some((s) => s.state === 'error')).toBe(false);

    // Verify both tried same-origin first (useCloudServer: false/undefined) and then retried with useCloudServer: true
    expect(factoryCalls).toEqual([
      { id: 'shift-game-room-cld01', useCloudServer: false },
      { id: 'shift-game-room-cld01', useCloudServer: true },
      { id: undefined, useCloudServer: false },
      { id: undefined, useCloudServer: true },
    ]);

    // Subsequent hostRoom call on same PeerManager should go straight to cloud server
    host.disconnect();
    client.disconnect();
    factoryCalls.length = 0;

    await host.hostRoom('CLD02');
    expect(factoryCalls).toEqual([
      { id: 'shift-game-room-cld02', useCloudServer: true },
    ]);

    host.disconnect();
  });

  it('does not register duplicate data listeners when upgrading from WebSocket relay to direct WebRTC DataConnection', async () => {
    type SocketListener = (data: unknown) => void;
    const sockets = new Map<string, Set<SocketListener>>();

    const createSocket = (myPeerId: string) => {
      const listeners = new Set<SocketListener>();
      sockets.set(myPeerId, listeners);
      return {
        on: vi.fn((event: string, cb: SocketListener) => {
          if (event === 'message') listeners.add(cb);
        }),
        send: vi.fn((raw: unknown) => {
          const msg = raw as { type?: string; dst?: string; payload?: unknown };
          if (!msg?.dst) return;
          const target = sockets.get(msg.dst);
          if (!target) return;
          queueMicrotask(() => {
            for (const fn of target) {
              fn({
                type: msg.type,
                src: myPeerId,
                dst: msg.dst,
                payload: msg.payload,
              });
            }
          });
        }),
      };
    };

    let hostWebRtcConn: InMemoryDataConnectionLike | null = null;
    let clientWebRtcConn: InMemoryDataConnectionLike | null = null;

    interface InMemoryDataConnectionLike extends IDataConnectionLike {
      open: boolean;
      triggerOpen(): void;
      triggerData(data: unknown): void;
    }

    const makeDelayedConn = (peerId: string): InMemoryDataConnectionLike => {
      const openListeners = new Set<() => void>();
      const dataListeners = new Set<(d: unknown) => void>();
      const conn: InMemoryDataConnectionLike = {
        peer: peerId,
        open: false,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
          if (event === 'open') openListeners.add(cb as () => void);
          if (event === 'data') dataListeners.add(cb as (d: unknown) => void);
          return conn;
        }),
        triggerOpen() {
          this.open = true;
          for (const fn of openListeners) fn();
        },
        triggerData(data: unknown) {
          for (const fn of dataListeners) fn(data);
        },
      };
      return conn;
    };

    let hostConnectionCb: ((conn: IDataConnectionLike) => void) | null = null;

    const upgradeFactory = (requestedId?: string): IPeerLike => {
      const peerId = requestedId ?? 'client-upgrade-1';
      let openCb: ((id: string) => void) | null = null;
      const socket = createSocket(peerId);
      const fakePeer: IPeerLike = {
        id: peerId,
        destroyed: false,
        disconnected: false,
        socket,
        connect: vi.fn((targetId: string) => {
          clientWebRtcConn = makeDelayedConn(targetId);
          hostWebRtcConn = makeDelayedConn(peerId);
          queueMicrotask(() => {
            hostConnectionCb?.(hostWebRtcConn!);
          });
          return clientWebRtcConn;
        }),
        destroy: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
          if (event === 'open') openCb = cb as (id: string) => void;
          if (event === 'connection') {
            hostConnectionCb = cb as (conn: IDataConnectionLike) => void;
          }
          return fakePeer;
        }),
      };
      queueMicrotask(() => openCb?.(peerId));
      return fakePeer;
    };

    const host = new PeerManager({
      peerFactory: upgradeFactory,
      relayFallbackDelayMs: 100,
    });
    const client = new PeerManager({
      peerFactory: upgradeFactory,
      relayFallbackDelayMs: 100,
    });

    await host.hostRoom('UPG01');
    const joinP = client.joinRoom('UPG01');
    await Promise.resolve();
    vi.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();
    await joinP;

    expect(host.isUsingRelay()).toBe(true);
    expect(client.isUsingRelay()).toBe(true);

    // Now direct WebRTC finishes ICE negotiation and opens on both sides
    hostWebRtcConn!.triggerOpen();
    clientWebRtcConn!.triggerOpen();

    expect(host.isUsingRelay()).toBe(false);
    expect(client.isUsingRelay()).toBe(false);

    const hostReceived: NetPacket[] = [];
    host.onPacket((p) => hostReceived.push(p));

    hostWebRtcConn!.triggerData(
      serializePacket({
        type: 'input',
        playerId: 2,
        clientTick: 1,
        input: createDefaultPlayerInput(),
      })
    );

    expect(hostReceived).toHaveLength(1);

    host.disconnect();
    client.disconnect();
  });

  it('keeps every WebSocket relay frame under 12KB (avoiding 0.peerjs.com CloseCode 1009 MessageTooBig) and paces cloud relay StatePackets while preserving GameEvents', async () => {
    type SocketListener = (data: unknown) => void;
    const sockets = new Map<string, Set<SocketListener>>();
    const wireFrameByteLengths: number[] = [];

    const createSocket = (myPeerId: string) => {
      const listeners = new Set<SocketListener>();
      sockets.set(myPeerId, listeners);
      return {
        on: vi.fn((event: string, cb: SocketListener) => {
          if (event === 'message') listeners.add(cb);
        }),
        send: vi.fn((raw: unknown) => {
          const serializedWire = JSON.stringify(raw);
          wireFrameByteLengths.push(serializedWire.length);
          const msg = JSON.parse(serializedWire) as {
            type?: string;
            dst?: string;
            payload?: unknown;
          };
          if (!msg?.dst) return;
          const target = sockets.get(msg.dst);
          if (!target) return;
          queueMicrotask(() => {
            for (const fn of target) {
              fn({
                type: msg.type,
                src: myPeerId,
                dst: msg.dst,
                payload: msg.payload,
              });
            }
          });
        }),
      };
    };

    const cloudRelayFactory = (requestedId?: string): IPeerLike => {
      const peerId = requestedId ?? 'cloud-client-1';
      let openCb: ((id: string) => void) | null = null;
      const socket = createSocket(peerId);
      const stalledConn: IDataConnectionLike = {
        peer: 'shift-game-room-6jt44',
        open: false,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(() => stalledConn),
      };
      const fakePeer: IPeerLike = {
        id: peerId,
        destroyed: false,
        disconnected: false,
        isCloudBroker: true,
        socket,
        connect: vi.fn(() => stalledConn),
        destroy: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
          if (event === 'open') openCb = cb as (id: string) => void;
          return fakePeer;
        }),
      };
      queueMicrotask(() => openCb?.(peerId));
      return fakePeer;
    };

    const host = new PeerManager({
      peerFactory: cloudRelayFactory,
      relayFallbackDelayMs: 50,
      pingIntervalMs: 60000,
    });
    const client = new PeerManager({
      peerFactory: cloudRelayFactory,
      relayFallbackDelayMs: 50,
      pingIntervalMs: 60000,
    });

    await host.hostRoom('6JT44');
    const joinP = client.joinRoom('6JT44');
    await Promise.resolve();
    vi.advanceTimersByTime(60);
    await Promise.resolve();
    await Promise.resolve();
    await joinP;

    const clientReceived: NetPacket[] = [];
    client.onPacket((p) => clientReceived.push(p));

    wireFrameByteLengths.length = 0;

    // 1. Host sends startGame lobbySync followed immediately (within same 16ms frame) by
    // tick 1 StatePacket (with an event) and tick 2 StatePacket (routine).
    host.sendPacket({
      type: 'lobbySync',
      lobbyConfig: createDefaultLobbyConfig(),
      hostReady: true,
      clientReady: true,
      startGame: true,
    });

    const engine = new GameEngine();
    const state1 = structuredClone(engine.getState());
    state1.tick = 1;
    state1.events = [
      { eventId: 1, type: 'playSound', sound: 'doorClosing' },
    ];
    host.sendPacket({
      type: 'state',
      hostTick: 1,
      lastProcessedClientTick: 0,
      state: state1,
    });

    const state2 = structuredClone(engine.getState());
    state2.tick = 2;
    state2.events = [];
    host.sendPacket({
      type: 'state',
      hostTick: 2,
      lastProcessedClientTick: 0,
      state: state2,
    });

    // Advance past cloud relay interval so coalesced state flushes
    vi.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();

    // Every single WebSocket frame sent on the wire must be strictly < 12,000 bytes
    // (well below 0.peerjs.com's ~19KB CloseCode 1009 limit)
    expect(wireFrameByteLengths.length).toBeGreaterThan(0);
    for (const byteLen of wireFrameByteLengths) {
      expect(byteLen).toBeLessThan(12000);
    }

    // Client must have received the latest state (hostTick 2) WITH the preserved event from tick 1!
    const statePackets = clientReceived.filter(
      (p): p is StatePacket => p.type === 'state'
    );
    expect(statePackets.length).toBeGreaterThan(0);
    const latestState = statePackets[statePackets.length - 1];
    expect(latestState.hostTick).toBe(2);
    expect(latestState.state.events.some((e) => e.eventId === 1)).toBe(true);

    // 2. Simulate 20 transient 'peer-unavailable' (EXPIRE) errors on Client while Host signaling reconnects:
    // Client must remain 'connected' and NOT abort to lobby with "Could not connect to peer shift-game-room-6jt44"
    const clientPeer = (client as unknown as { peer: IPeerLike }).peer;
    const peerUnavailableListeners = (
      clientPeer.on as ReturnType<typeof vi.fn>
    ).mock.calls
      .filter((c) => c[0] === 'error')
      .map((c) => c[1] as (err: Error & { type?: string }) => void);

    for (let i = 0; i < 20; i++) {
      const expireErr = new Error(
        'Could not connect to peer shift-game-room-6jt44'
      ) as Error & { type?: string };
      expireErr.type = 'peer-unavailable';
      for (const fn of peerUnavailableListeners) {
        fn(expireErr);
      }
    }

    expect(client.getConnectionState()).toBe('connected');

    host.disconnect();
    client.disconnect();
  });

  it('survives Client peerInstance.reconnect() re-emitting "open", Host peer-unavailable blips, and Host early WebRTC failure before WS relay SYN arrives', async () => {
    type SocketListener = (data: unknown) => void;
    const sockets = new Map<string, Set<SocketListener>>();

    const createSocket = (myPeerId: string) => {
      const listeners = new Set<SocketListener>();
      sockets.set(myPeerId, listeners);
      return {
        on: vi.fn((event: string, cb: SocketListener) => {
          if (event === 'message') listeners.add(cb);
        }),
        send: vi.fn((raw: unknown) => {
          const msg = raw as { type?: string; dst?: string; payload?: unknown };
          if (!msg?.dst) return;
          const target = sockets.get(msg.dst);
          if (!target) return;
          queueMicrotask(() => {
            for (const fn of target) {
              fn({
                type: msg.type,
                src: myPeerId,
                dst: msg.dst,
                payload: msg.payload,
              });
            }
          });
        }),
      };
    };

    let hostConnectionCb = null as ((conn: IDataConnectionLike) => void) | null;
    let hostIncomingWebRtcErrorCb = null as ((err: Error) => void) | null;
    let hostIncomingWebRtcCloseCb = null as (() => void) | null;
    let clientOpenCb = null as ((id: string) => void) | null;
    const hostErrorCbs: Array<(err: Error & { type?: string }) => void> = [];

    const resilientFactory = (requestedId?: string): IPeerLike => {
      const isHost = Boolean(requestedId);
      const peerId = requestedId ?? 'client-reconnect-peer';
      let openCb: ((id: string) => void) | null = null;
      const socket = createSocket(peerId);

      const makeStalledConn = (targetId: string): IDataConnectionLike => {
        const conn: IDataConnectionLike = {
          peer: targetId,
          open: false,
          send: vi.fn(),
          close: vi.fn(),
          on: vi.fn((ev: string, cb: (...args: any[]) => void) => {
            if (!isHost) {
              return conn;
            }
            if (ev === 'error') hostIncomingWebRtcErrorCb = cb as (err: Error) => void;
            if (ev === 'close') hostIncomingWebRtcCloseCb = cb as () => void;
            return conn;
          }),
        };
        return conn;
      };

      const fakePeer: IPeerLike = {
        id: peerId,
        destroyed: false,
        disconnected: false,
        socket,
        connect: vi.fn((targetId: string) => {
          // Simulate PeerJS immediately delivering incoming unopened DataConnection to Host on OFFER
          const hostSideConn: IDataConnectionLike = {
            peer: peerId,
            open: false,
            send: vi.fn(),
            close: vi.fn(),
            on: vi.fn((ev: string, cb: (...args: any[]) => void) => {
              if (ev === 'error') hostIncomingWebRtcErrorCb = cb as (err: Error) => void;
              if (ev === 'close') hostIncomingWebRtcCloseCb = cb as () => void;
              return hostSideConn;
            }),
          };
          queueMicrotask(() => {
            hostConnectionCb?.(hostSideConn);
          });
          return makeStalledConn(targetId);
        }),
        destroy: vi.fn(),
        disconnect: vi.fn(function (this: { disconnected: boolean }) {
          this.disconnected = true;
        }),
        reconnect: vi.fn(function (this: { disconnected: boolean }) {
          this.disconnected = false;
          // PeerJS re-emits 'open' when reconnect() receives OPEN from signaling server!
          openCb?.(peerId);
        }),
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
          if (event === 'open') {
            openCb = cb as (id: string) => void;
            if (!isHost) clientOpenCb = openCb;
          }
          if (event === 'connection' && isHost) {
            hostConnectionCb = cb as (conn: IDataConnectionLike) => void;
          }
          if (event === 'error' && isHost) {
            hostErrorCbs.push(cb as (err: Error & { type?: string }) => void);
          }
          return fakePeer;
        }),
      };

      queueMicrotask(() => openCb?.(peerId));
      return fakePeer;
    };

    const host = new PeerManager({
      peerFactory: resilientFactory,
      relayFallbackDelayMs: 500,
      pingIntervalMs: 60000,
    });
    const client = new PeerManager({
      peerFactory: resilientFactory,
      relayFallbackDelayMs: 500,
      pingIntervalMs: 60000,
    });

    await host.hostRoom('RES01');
    const joinP = client.joinRoom('RES01');
    await Promise.resolve();
    await Promise.resolve();

    // 1. Before relayFallbackDelayMs (500ms) elapses, the Host's incoming unopened WebRTC DataConnection
    // emits 'error' and 'close'. Host MUST remain in 'hosting' state and NOT transition to 'error' or 'disconnected'!
    expect(hostIncomingWebRtcErrorCb).toBeTruthy();
    hostIncomingWebRtcErrorCb?.(new Error('ICE negotiation failed early'));
    hostIncomingWebRtcCloseCb?.();
    expect(host.getConnectionState()).toBe('hosting');

    // Now advance past relayFallbackDelayMs (500ms) so WS relay SYN/ACK completes
    vi.advanceTimersByTime(600);
    await Promise.resolve();
    await Promise.resolve();
    await joinP;

    expect(host.getConnectionState()).toBe('connected');
    expect(client.getConnectionState()).toBe('connected');
    expect(host.isUsingRelay()).toBe(true);
    expect(client.isUsingRelay()).toBe(true);

    // 2. Simulate Client signaling blip + reconnect(), which re-emits 'open' on Client peerInstance:
    // Client MUST keep its active PeerSocketRelayConnection and NOT overwrite it with an unopened WebRTC conn!
    expect(clientOpenCb).toBeTruthy();
    clientOpenCb!('client-reconnect-peer');
    expect(client.isUsingRelay()).toBe(true);

    const hostReceived: NetPacket[] = [];
    host.onPacket((p) => hostReceived.push(p));
    client.sendPacket({
      type: 'input',
      playerId: 2,
      clientTick: 9,
      input: createDefaultPlayerInput(),
    });
    await Promise.resolve();
    expect(hostReceived.some((p) => p.type === 'input' && p.clientTick === 9)).toBe(true);

    // 3. Simulate Host receiving 15 transient 'peer-unavailable' (EXPIRE) errors while Client signaling reconnects:
    // Host MUST remain 'connected' and NOT abort to 'error'!
    for (let i = 0; i < 15; i++) {
      const expireErr = new Error(
        'Could not connect to peer client-reconnect-peer'
      ) as Error & { type?: string };
      expireErr.type = 'peer-unavailable';
      for (const fn of hostErrorCbs) {
        fn(expireErr);
      }
    }
    expect(host.getConnectionState()).toBe('connected');

    host.disconnect();
    client.disconnect();
  });
});
