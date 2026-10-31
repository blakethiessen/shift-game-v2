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

    it('activates heartBeat loop when Injured/Dying or convergenceDistance <= 2 and ramps playbackRate at convergenceDistance === 0', () => {
      const state = createMockGameState();
      state.convergenceDistance = 5;
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().heartBeat?.active).toBeFalsy();

      // Convergence distance <= 2 triggers heartbeat
      state.convergenceDistance = 2;
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().heartBeat?.active).toBe(true);
      const rateAt2 = audio.getActiveLoops().heartBeat!.playbackRate;

      // Convergence distance === 0 ramps up playback rate & volume
      state.convergenceDistance = 0;
      audio.updateAmbientAndLoops(state, 1, 'local');
      expect(audio.getActiveLoops().heartBeat?.active).toBe(true);
      expect(audio.getActiveLoops().heartBeat!.playbackRate).toBeGreaterThan(rateAt2);
      expect(audio.getActiveLoops().heartBeat!.gain).toBeGreaterThan(audio.getSFXVolume() * 0.8);
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
});
