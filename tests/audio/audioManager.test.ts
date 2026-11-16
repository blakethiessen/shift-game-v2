import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AudioManager,
  MUSIC_TRACK_PATHS,
  SOUND_EFFECT_PATHS,
  THREAT_MUSIC_LIST,
  NO_THREAT_MUSIC_LIST,
  MAX_SFX_CHANNELS,
} from '../../src/audio/audioManager';
import {
  GameState,
  SoundEffectName,
  MusicTrackName,
  Direction,
  createDefaultLobbyConfig,
  GridCell,
  WorldGridState,
} from '../../src/shared/types';

function createEmptyGrid(world: 'neutral' | 'dangerous'): WorldGridState {
  const cells: GridCell[][] = [];
  for (let x = 0; x < 20; x++) {
    cells[x] = [];
    for (let y = 0; y < 26; y++) {
      cells[x][y] = {
        floorGid: 1,
        wallGid: 0,
        wallOverlayGid: 0,
        wallDoorGid: 0,
        holeGid: 0,
        obstacleGids: [],
        fakePlateGid: 0,
        synthesizedGhostWall: false,
        collides: false,
        noLight: false,
        isHole: false,
        isWallDoor: false,
        hasSwooshTrigger: false,
      };
    }
  }
  return {
    world,
    cells,
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
}

function createMockGameState(overrides: Partial<GameState> = {}): GameState {
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
        neutral: createEmptyGrid('neutral'),
        dangerous: createEmptyGrid('dangerous'),
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
        x: 200,
        y: 300,
        velocity: { x: 0, y: 0 },
        direction: Direction.Down,
        flashLightDir: Direction.None,
        speed: 2.0,
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
          direction: Direction.None,
          hasDealtKnockback: false,
        },
        interactingObjectId: null,
        activePopupText: null,
        popupFaceDirection: Direction.None,
        atDoorId: null,
        ping: null,
      },
      {
        id: 2,
        side: 'right',
        x: 200,
        y: 300,
        velocity: { x: 0, y: 0 },
        direction: Direction.Down,
        flashLightDir: Direction.None,
        speed: 2.0,
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
          direction: Direction.None,
          hasDealtKnockback: false,
        },
        interactingObjectId: null,
        activePopupText: null,
        popupFaceDirection: Direction.None,
        atDoorId: null,
        ping: null,
      },
    ],
    persistence: {},
    events: [],
    ...overrides,
  };
}

describe('AudioManager', () => {
  let audio: AudioManager;

  beforeEach(async () => {
    audio = new AudioManager();
    await audio.init();
  });

  describe('Asset Mapping Completeness', () => {
    it('maps all 19 music tracks and all 34+ sound effects including previously unused horror assets', () => {
      const musicKeys = Object.keys(MUSIC_TRACK_PATHS) as MusicTrackName[];
      expect(musicKeys.length).toBe(19);
      expect(MUSIC_TRACK_PATHS.start).toBe('/music/chase.ogg');
      expect(MUSIC_TRACK_PATHS.ambience2).toBe('/music/ambience2.ogg');
      expect(MUSIC_TRACK_PATHS.crazyPiano).toBe('/music/crazyPiano.ogg');
      expect(MUSIC_TRACK_PATHS.piano).toBe('/music/piano.ogg');
      expect(MUSIC_TRACK_PATHS.goblinSound).toBe('/music/globinSound.ogg');
      expect(MUSIC_TRACK_PATHS.bigHit).toBe('/music/bigHit.ogg');
      expect(MUSIC_TRACK_PATHS.chimes).toBe('/music/chimes.ogg');
      expect(MUSIC_TRACK_PATHS.swoosh).toBe('/music/swoosh.ogg');

      const requiredSfx: SoundEffectName[] = [
        'blobbyTracking',
        'damage',
        'menuSelect',
        'inventory',
        'shift',
        'evilLampAttack',
        'shortAttack',
        'longAttack',
        'death',
        'walk',
        'eatingFood',
        'menuCycle',
        'fire',
        'doorClosing',
        'flashlightOnOff',
        'itemDrop',
        'itemPickup',
        'doorUnlocking',
        'doorLocking',
        'error',
        'safeOpening',
        'leverOff',
        'leverOn',
        'weaponSwoosh',
        'fryingPanHit',
        'heartBeat',
        'creaking1',
        'creaking2',
        'creaking3',
        'creaking4',
        'growl1',
        'growl2',
        'growl3',
        'growl4',
        'growl5',
        'bigHit',
        'chimes',
        'swoosh',
      ];
      for (const sfx of requiredSfx) {
        expect(SOUND_EFFECT_PATHS[sfx]).toBeDefined();
        expect(SOUND_EFFECT_PATHS[sfx].endsWith('.ogg')).toBe(true);
      }
      expect(SOUND_EFFECT_PATHS.evilLampAttack).toBe('/soundEffects/lampEnemyAttack.ogg');
      expect(SOUND_EFFECT_PATHS.growl1).toBe('/soundEffects/Growl 1.ogg');
      expect(SOUND_EFFECT_PATHS.doorLocking).toBe('/soundEffects/doorLocking.ogg');
      expect(NO_THREAT_MUSIC_LIST).toContain('ambience2');
      expect(THREAT_MUSIC_LIST).toEqual(['ambience4', 'start', 'demonBass', 'goblinSound']);
    });
  });

  describe('5-Channel SFX Pool', () => {
    it('limits concurrent one-shot SFX channels to 5 and evicts the oldest non-critical channel when full', () => {
      expect(MAX_SFX_CHANNELS).toBe(5);

      audio.playSound('menuCycle');
      audio.playSound('creaking1');
      audio.playSound('growl1');
      audio.playSound('itemPickup');
      audio.playSound('weaponSwoosh');

      expect(audio.getActiveChannelCount()).toBe(5);
      expect(audio.getActiveChannels().map((c) => c.name)).toEqual([
        'menuCycle',
        'creaking1',
        'growl1',
        'itemPickup',
        'weaponSwoosh',
      ]);

      // Playing a 6th sound evicts 'menuCycle' (oldest non-critical)
      audio.playSound('fryingPanHit');
      expect(audio.getActiveChannelCount()).toBe(5);
      expect(audio.getActiveChannels().map((c) => c.name)).toEqual([
        'creaking1',
        'growl1',
        'itemPickup',
        'weaponSwoosh',
        'fryingPanHit',
      ]);
    });

    it('preserves critical SFX (e.g. death, shift) over non-critical SFX when evicting from full pool', () => {
      audio.playSound('death'); // critical
      audio.playSound('shift'); // critical
      audio.playSound('creaking2'); // non-critical (should be evicted first!)
      audio.playSound('damage'); // critical
      audio.playSound('safeOpening'); // critical

      expect(audio.getActiveChannelCount()).toBe(5);

      audio.playSound('growl2');
      const names = audio.getActiveChannels().map((c) => c.name);
      expect(names).toHaveLength(5);
      expect(names).toContain('death');
      expect(names).toContain('shift');
      expect(names).not.toContain('creaking2');
      expect(names).toContain('growl2');
    });
  });

  describe('Muffled Cross-Dimension Audio Filter (Online Mode)', () => {
    it('routes cross-dimension sounds in online mode through a 350Hz lowpass BiquadFilterNode with 0.45 * sfxVolume gain', () => {
      audio.setSFXVolume(0.8);

      // Partner sound on right while local player is on left in online mode
      audio.playSound('growl3', {
        side: 'right',
        localSide: 'left',
        mode: 'online',
        muffleCrossDimension: true,
      });

      const channels = audio.getActiveChannels();
      expect(channels).toHaveLength(1);
      expect(channels[0].muffled).toBe(true);
      expect(channels[0].filterType).toBe('lowpass');
      expect(channels[0].filterFrequency).toBe(350);
      expect(channels[0].gain).toBeCloseTo(0.45 * 0.8, 5);
    });

    it('does not muffle sounds from the same dimension or in local mode or when muffleCrossDimension is false', () => {
      audio.setSFXVolume(0.8);

      audio.playSound('growl1', {
        side: 'left',
        localSide: 'left',
        mode: 'online',
        muffleCrossDimension: true,
      });
      audio.playSound('growl2', {
        side: 'right',
        localSide: 'left',
        mode: 'local',
        muffleCrossDimension: true,
      });
      audio.playSound('growl4', {
        side: 'right',
        localSide: 'left',
        mode: 'online',
        muffleCrossDimension: false,
      });

      const channels = audio.getActiveChannels();
      expect(channels).toHaveLength(3);
      for (const ch of channels) {
        expect(ch.muffled).toBe(false);
        expect(ch.gain).toBeCloseTo(0.8, 5);
      }
    });
  });

  describe('Independent Footstep & Ambient Loops', () => {
    it('tracks walk_p1 and walk_p2 independently so Player 1 stopping never silences Player 2', () => {
      const state = createMockGameState();
      state.players[0].isMoving = true;
      state.players[1].isMoving = true;

      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().walk_p1?.active).toBe(true);
      expect(audio.getActiveLoops().walk_p2?.active).toBe(true);

      // Player 1 stops moving, Player 2 keeps moving
      state.players[0].isMoving = false;
      state.players[1].isMoving = true;
      audio.updateAmbientAndLoops(state, 1, 'local');

      expect(audio.getActiveLoops().walk_p1?.active).toBeFalsy();
      expect(audio.getActiveLoops().walk_p2?.active).toBe(true);
    });

    it('muffles partner footsteps in online mode when partner is in the other dimension', () => {
      const state = createMockGameState();
      state.lobbyConfig.mode = 'online';
      state.lobbyConfig.muffledCrossDimensionAudio = true;
      state.players[0].isMoving = true;
      state.players[1].isMoving = true;

      audio.updateAmbientAndLoops(state, 1, 'online');
      const loops = audio.getActiveLoops();
      expect(loops.walk_p1?.active).toBe(true);
      expect(loops.walk_p1?.muffled).toBe(false);
      expect(loops.walk_p2?.active).toBe(true);
      expect(loops.walk_p2?.muffled).toBe(true);
      expect(loops.walk_p2?.filterFrequency).toBe(350);
    });

    it('manages fire loop based on active FireEntity in room and stops when extinguished', () => {
      const state = createMockGameState();
      state.room.worlds.neutral.fires.push({
        id: 'fire_1',
        world: 'neutral',
        x: 100,
        y: 100,
        gid: 100,
        variant: 1,
        isOn: true,
        damageTimerMs: 0,
      });

      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().fire?.active).toBe(true);

      // Lever turns fire off
      state.room.worlds.neutral.fires[0].isOn = false;
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().fire?.active).toBeFalsy();
    });

    it('does not play heartBeat at spawn when healthy (even at convergenceDistance === 0), and activates heartBeat when Injured or Dying', () => {
      const state = createMockGameState();
      state.convergenceDistance = 0;
      state.players[0].healthState = 'Normal';
      state.players[1].healthState = 'Normal';
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().heartBeat?.active).toBeFalsy();

      // Bruised does not trigger heartBeat
      state.players[0].healthState = 'Bruised';
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().heartBeat?.active).toBeFalsy();

      // Injured player triggers heartbeat
      state.players[0].healthState = 'Injured';
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().heartBeat?.active).toBe(true);
      const rateWhenInjured = audio.getActiveLoops().heartBeat!.playbackRate;

      // In online mode, healthy local player (P2) does not hear heartbeat when only partner (P1) is Injured
      audio.updateAmbientAndLoops(state, 2, 'online');
      expect(audio.getActiveLoops().heartBeat?.active).toBeFalsy();

      // Dying player ramps up playback rate & volume
      state.players[0].healthState = 'Dying';
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().heartBeat?.active).toBe(true);
      expect(audio.getActiveLoops().heartBeat!.playbackRate).toBeGreaterThan(rateWhenInjured);
      expect(audio.getActiveLoops().heartBeat!.gain).toBeGreaterThan(audio.getSFXVolume() * 0.8);

      // Healing back to Bruised or dying (isAlive = false) stops the heartBeat loop
      state.players[0].healthState = 'Bruised';
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().heartBeat?.active).toBeFalsy();
    });

    it('activates blobbyTracking loop when any Blobby is in Seeking state and stops when wandering', () => {
      const state = createMockGameState();
      state.room.worlds.dangerous.blobbies.push({
        id: 'b1',
        world: 'dangerous',
        x: 100,
        y: 100,
        velocity: { x: 1, y: 0 },
        direction: Direction.Right,
        state: 'Seeking',
        currentSpeed: 1.5,
        wanderTimerTicks: 0,
        wanderIntervalTicks: 60,
        eatingTimerTicks: 0,
        path: [],
        nextStepIdx: 0,
        nextStep: null,
        oldTargetCoord: { x: 4, y: 4 },
      });

      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().blobbyTracking?.active).toBe(true);

      state.room.worlds.dangerous.blobbies[0].state = 'Wandering';
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().blobbyTracking?.active).toBeFalsy();
    });
  });

  describe('Dynamic Horror Music Rotation & Volume Control', () => {
    it('selects piano in choiceRoom, crazyPiano on high tear/seeking count, threatMusic with monsters, and noThreatMusic otherwise', () => {
      const state = createMockGameState({ roomName: 'choiceRoom' });
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getCurrentMusicTrack()).toBe('piano');

      // High tear count (>= 5) -> crazyPiano
      state.roomName = 'maze1';
      state.room.tears = Array.from({ length: 5 }, (_, i) => ({
        id: `t_${i}`,
        x: i * 25,
        y: 0,
        angle: Direction.Horizontal,
        stage: 1,
        growthTimerMs: 0,
        hasSpread: false,
      }));
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getCurrentMusicTrack()).toBe('crazyPiano');

      // Threat room (1 Blobby or EvilLamp, < 5 tears)
      state.room.tears = [];
      state.room.worlds.dangerous.evilLamps.push({
        id: 'el_1',
        world: 'dangerous',
        x: 50,
        y: 50,
        gid: 3402,
        isOn: true,
        linkedLampId: null,
        stage: 'dormant',
        timerMs: 0,
        popUpText: '',
      });
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(THREAT_MUSIC_LIST).toContain(audio.getCurrentMusicTrack());

      // No threat room
      state.room.worlds.dangerous.evilLamps = [];
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(NO_THREAT_MUSIC_LIST).toContain(audio.getCurrentMusicTrack());
    });

    it('respects musicVolume and sfxVolume and toggleMute across all channels', () => {
      audio.setMusicVolume(0.25);
      expect(audio.getMusicVolume()).toBeCloseTo(0.25, 5);

      audio.setSFXVolume(0.6);
      expect(audio.getSFXVolume()).toBeCloseTo(0.6, 5);

      expect(audio.isMuted()).toBe(false);
      const muted = audio.toggleMute();
      expect(muted).toBe(true);
      expect(audio.isMuted()).toBe(true);

      const unmuted = audio.toggleMute();
      expect(unmuted).toBe(false);
      expect(audio.isMuted()).toBe(false);

      audio.stopAll();
      expect(audio.getActiveChannelCount()).toBe(0);
      expect(audio.getCurrentMusicTrack()).toBeNull();
    });

    it('processes playSound GameEvents idempotently by eventId and applies cross-dimension muffling in online mode', () => {
      const state = createMockGameState();
      state.lobbyConfig.mode = 'online';
      state.lobbyConfig.muffledCrossDimensionAudio = true;
      state.events = [
        {
          eventId: 101,
          type: 'playSound',
          sound: 'evilLampAttack',
          world: 'dangerous', // right side since evilOnLeft === false
        },
      ];

      audio.updateAmbientAndLoops(state, 1, 'online');
      expect(audio.getActiveChannelCount()).toBe(1);
      expect(audio.getActiveChannels()[0].name).toBe('evilLampAttack');
      expect(audio.getActiveChannels()[0].muffled).toBe(true);

      // Calling updateAmbientAndLoops again with the same eventId must not duplicate the sound
      audio.updateAmbientAndLoops(state, 1, 'online');
      expect(audio.getActiveChannelCount()).toBe(1);
    });
  });

  describe('Audio Lifecycle, Decode Failures, Music Reset & Dying Phase', () => {
    it('negative-caches failed decode paths, cleans up failed playSound channels, and clears track after one-shot playMusicVolumeTest ends', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('404 Not Found'));
      const createdSources: Array<{ onended: (() => void) | null; stop: any; start: any; disconnect: any }> = [];
      const mockCtx = {
        state: 'interrupted',
        currentTime: 0,
        destination: {},
        resume: vi.fn(async () => {
          mockCtx.state = 'running';
        }),
        createGain: vi.fn(() => ({
          gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        })),
        createBiquadFilter: vi.fn(() => ({
          type: 'lowpass',
          frequency: { value: 350, setValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        })),
        createBufferSource: vi.fn(() => {
          const src = {
            buffer: null,
            loop: false,
            onended: null as (() => void) | null,
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          };
          createdSources.push(src);
          return src;
        }),
        decodeAudioData: vi.fn(async () => ({ duration: 1.0 })),
      };

      const mgr = new AudioManager({
        createAudioContext: () => mockCtx as any,
        fetchFn: fetchMock as any,
      });
      await mgr.init();
      // Interrupted context must be resumed by ensureContextResumed
      expect(mockCtx.resume).toHaveBeenCalledTimes(1);

      mgr.playSound('error');
      await new Promise((r) => setTimeout(r, 10));
      // Failed channel must be cleaned out of active channels, and path negative-cached so second call skips fetch
      expect(mgr.getActiveChannelCount()).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      mgr.playSound('error');
      await new Promise((r) => setTimeout(r, 10));
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Now test playMusicVolumeTest clearing currentMusicTrack upon natural end
      fetchMock.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
      mgr.playMusicVolumeTest('ambience2');
      await new Promise((r) => setTimeout(r, 10));
      expect(mgr.getCurrentMusicTrack()).toBe('ambience2');
      const oneShotSrc = createdSources[createdSources.length - 1];
      oneShotSrc.onended?.();
      expect(mgr.getCurrentMusicTrack()).toBeNull();
    });

    it('silences active loops and stops threat music when phase becomes dying or non-playing', () => {
      const state = createMockGameState();
      state.players[0].isMoving = true;
      state.room.worlds.dangerous.blobbies.push({
        id: 'b_1',
        world: 'dangerous',
        x: 50,
        y: 50,
        velocity: { x: 0, y: 0 },
        direction: Direction.Down,
        state: 'Seeking',
        currentSpeed: 1,
        wanderTimerTicks: 0,
        wanderIntervalTicks: 60,
        eatingTimerTicks: 0,
        path: [],
        nextStepIdx: 0,
        nextStep: null,
        oldTargetCoord: { x: 2, y: 2 },
      });
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().walk_p1?.active).toBe(true);
      expect(audio.getActiveLoops().blobbyTracking?.active).toBe(true);
      expect(audio.getCurrentMusicTrack()).toBeTruthy();

      state.phase = 'dying';
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().walk_p1?.active).toBeFalsy();
      expect(audio.getActiveLoops().blobbyTracking?.active).toBeFalsy();
      expect(audio.getCurrentMusicTrack()).toBeNull();
    });

    it('does not orphan a newly started loop during async load race and cleans up listener/AudioContext on destroy()', async () => {
      let resolveFetch!: (ab: ArrayBuffer) => void;
      const closeSpy = vi.fn(async () => {});
      const sources: Array<{ stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> }> = [];
      const addSpy = vi.fn();
      const removeSpy = vi.fn();
      vi.stubGlobal('document', {
        hidden: false,
        addEventListener: addSpy,
        removeEventListener: removeSpy,
      });
      try {
        const mgr = new AudioManager({
          createAudioContext: () =>
            ({
              state: 'running',
              destination: {},
              close: closeSpy,
              suspend: vi.fn(async () => {}),
              resume: vi.fn(async () => {}),
              createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
              createBiquadFilter: () => ({
                type: 'lowpass',
                frequency: { value: 20000 },
                connect: vi.fn(),
                disconnect: vi.fn(),
              }),
              decodeAudioData: vi.fn(async () => ({ duration: 1 } as AudioBuffer)),
              createBufferSource: () => {
                const s = {
                  buffer: null,
                  loop: false,
                  playbackRate: { value: 1 },
                  connect: vi.fn(),
                  disconnect: vi.fn(),
                  start: vi.fn(),
                  stop: vi.fn(),
                };
                sources.push(s);
                return s;
              },
            }) as unknown as AudioContext,
          fetchFn: vi.fn(
            () =>
              new Promise((res) => {
                resolveFetch = (ab: ArrayBuffer) =>
                  res({ ok: true, arrayBuffer: async () => ab } as Response);
              })
          ) as unknown as typeof fetch,
        });

        await mgr.init();
        expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
        const st = createMockGameState();
        st.players[0].isMoving = true;
        mgr.updateAmbientAndLoops(st, 1, 'local'); // loopState1 starts loading
        st.players[0].isMoving = false;
        mgr.updateAmbientAndLoops(st, 1, 'local'); // loopState1 stopped before resolve
        st.players[0].isMoving = true;
        mgr.updateAmbientAndLoops(st, 1, 'local'); // loopState2 starts waiting on same load promise

        resolveFetch(new ArrayBuffer(8));
        await new Promise((r) => setTimeout(r, 15));

        expect(sources).toHaveLength(1);
        expect(sources[0].start).toHaveBeenCalledTimes(1);
        mgr.stopAll();
        expect(sources[0].stop).toHaveBeenCalledTimes(1);

        mgr.destroy();
        expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
        expect(closeSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
