import {
  DimensionSide,
  GameEvent,
  GameState,
  IAudioManager,
  LobbyConfig,
  MusicTrackName,
  PlayerId,
  PlayMode,
  SoundEffectName,
  getSideForWorld,
  getWorldForSide,
} from '../shared/types';

export const MAX_SFX_CHANNELS = 5;

export const MUSIC_TRACK_PATHS: Record<MusicTrackName, string> = {
  start: '/music/chase.ogg',
  ambience1: '/music/ambience1.ogg',
  ambience2: '/music/ambience2.ogg',
  ambience3: '/music/ambience3.ogg',
  ambience4: '/music/ambience4.ogg',
  ambience5: '/music/ambience5.ogg',
  ambience6: '/music/ambience6.ogg',
  ambience7: '/music/ambience7.ogg',
  ambience8: '/music/ambience8.ogg',
  bigHit: '/music/bigHit.ogg',
  chimes: '/music/chimes.ogg',
  crazyPiano: '/music/crazyPiano.ogg',
  demonBass: '/music/demonBass.ogg',
  demonVoice: '/music/demonVoice.ogg',
  eerieSynth: '/music/eerieSynth.ogg',
  goblinSound: '/music/globinSound.ogg',
  pianoEnd: '/music/pianoEnd.ogg',
  piano: '/music/piano.ogg',
  swoosh: '/music/swoosh.ogg',
};

export const SOUND_EFFECT_PATHS: Record<SoundEffectName, string> = {
  blobbyTracking: '/soundEffects/blobbyTracking.ogg',
  damage: '/soundEffects/playerDamaged.ogg',
  menuSelect: '/soundEffects/menuSelect.ogg',
  inventory: '/soundEffects/inventoryCycle.ogg',
  shift: '/soundEffects/shift.ogg',
  evilLampAttack: '/soundEffects/lampEnemyAttack.ogg',
  shortAttack: '/soundEffects/shortAttack.ogg',
  longAttack: '/soundEffects/longAttack.ogg',
  death: '/soundEffects/playerDeath.ogg',
  walk: '/soundEffects/playerWalking.ogg',
  eatingFood: '/soundEffects/eatingFood.ogg',
  menuCycle: '/soundEffects/menuCycle.ogg',
  fire: '/soundEffects/fire.ogg',
  doorClosing: '/soundEffects/doorClosing.ogg',
  flashlightOnOff: '/soundEffects/flashlightOnOff.ogg',
  itemDrop: '/soundEffects/itemDrop.ogg',
  itemPickup: '/soundEffects/itemPickup.ogg',
  doorUnlocking: '/soundEffects/doorUnlocking.ogg',
  doorLocking: '/soundEffects/doorLocking.ogg',
  error: '/soundEffects/error.ogg',
  safeOpening: '/soundEffects/safeOpening.ogg',
  leverOff: '/soundEffects/leverOff.ogg',
  leverOn: '/soundEffects/leverOn.ogg',
  weaponSwoosh: '/soundEffects/weaponSwoosh.ogg',
  fryingPanHit: '/soundEffects/fryingPanHit.ogg',
  heartBeat: '/soundEffects/heartBeat.ogg',
  creaking1: '/soundEffects/creaking1.ogg',
  creaking2: '/soundEffects/creaking2.ogg',
  creaking3: '/soundEffects/creaking3.ogg',
  creaking4: '/soundEffects/creaking4.ogg',
  growl1: '/soundEffects/Growl 1.ogg',
  growl2: '/soundEffects/Growl 2.ogg',
  growl3: '/soundEffects/Growl 3.ogg',
  growl4: '/soundEffects/Growl 4.ogg',
  growl5: '/soundEffects/Growl 5.ogg',
  bigHit: '/music/bigHit.ogg',
  chimes: '/music/chimes.ogg',
  swoosh: '/music/swoosh.ogg',
};

export const NO_THREAT_MUSIC_LIST: MusicTrackName[] = [
  'ambience1',
  'ambience2',
  'ambience3',
  'ambience5',
  'ambience6',
  'ambience7',
  'ambience8',
  'demonVoice',
  'eerieSynth',
  'pianoEnd',
];

export const THREAT_MUSIC_LIST: MusicTrackName[] = [
  'ambience4',
  'start',
  'demonBass',
  'goblinSound',
];

const CRITICAL_SFX: ReadonlySet<SoundEffectName> = new Set<SoundEffectName>([
  'death',
  'shift',
  'damage',
  'safeOpening',
  'doorUnlocking',
  'evilLampAttack',
  'bigHit',
]);

export type LoopKey =
  | 'walk_p1'
  | 'walk_p2'
  | 'fire'
  | 'heartBeat'
  | 'blobbyTracking';

export interface ActiveSfxChannel {
  id: number;
  name: SoundEffectName;
  critical: boolean;
  muffled: boolean;
  filterType: 'lowpass' | 'none';
  filterFrequency: number;
  gain: number;
  effectiveGain: number;
  startedAt: number;
  stop: () => void;
}

export interface ActiveLoopState {
  key: LoopKey;
  sound: SoundEffectName;
  active: boolean;
  muffled: boolean;
  filterFrequency: number;
  playbackRate: number;
  gain: number;
  stop: () => void;
  updateParams: (muffled: boolean, playbackRate: number, gain: number) => void;
}

const CROSS_DIM_LOWPASS_HZ = 350;
const CROSS_DIM_GAIN_FACTOR = 0.45;

export class AudioManager implements IAudioManager {
  private sfxVolume = 0.7;
  private musicVolume = 0.5;
  private muted = false;
  private initialized = false;
  private nextChannelId = 1;

  private audioCtx: AudioContext | null = null;
  private bufferCache = new Map<string, AudioBuffer>();
  private loadingPromises = new Map<string, Promise<AudioBuffer | null>>();

  private activeChannels: ActiveSfxChannel[] = [];
  private activeLoops: Partial<Record<LoopKey, ActiveLoopState>> = {};

  private currentMusicTrack: MusicTrackName | null = null;
  private currentMusicStop: (() => void) | null = null;
  private currentMusicUpdateGain: ((vol: number) => void) | null = null;

  private processedEventIds = new Set<number>();
  private lastProcessedTick = -1;
  private ambientCreakCounter = 0;

  public async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    if (typeof window !== 'undefined') {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextCtor) {
        try {
          this.audioCtx = new AudioContextCtor();
        } catch {
          this.audioCtx = null;
        }
      }
    }
  }

  private ensureContextResumed(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {
        // Ignore autoplay restrictions until user gesture
      });
    }
  }

  private async loadAudioBuffer(path: string): Promise<AudioBuffer | null> {
    if (!this.audioCtx || typeof fetch === 'undefined') {
      return null;
    }
    const cached = this.bufferCache.get(path);
    if (cached) {
      return cached;
    }
    const existing = this.loadingPromises.get(path);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      try {
        const res = await fetch(path);
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        if (!this.audioCtx) return null;
        const decoded = await this.audioCtx.decodeAudioData(arr);
        this.bufferCache.set(path, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        this.loadingPromises.delete(path);
      }
    })();

    this.loadingPromises.set(path, promise);
    return promise;
  }

  public playSound(
    name: SoundEffectName,
    options?: {
      side?: DimensionSide;
      localSide?: DimensionSide;
      mode?: PlayMode;
      muffleCrossDimension?: boolean;
    }
  ): void {
    this.ensureContextResumed();

    // Enforce 5-channel SFX pool limit
    if (this.activeChannels.length >= MAX_SFX_CHANNELS) {
      const nonCriticalIdx = this.activeChannels.findIndex((ch) => !ch.critical);
      const evictIdx = nonCriticalIdx !== -1 ? nonCriticalIdx : 0;
      const [evicted] = this.activeChannels.splice(evictIdx, 1);
      evicted?.stop();
    }

    const isMuffled =
      options?.mode === 'online' &&
      options?.muffleCrossDimension !== false &&
      Boolean(
        options?.side &&
          options?.localSide &&
          options.side !== options.localSide
      );

    const baseGain = isMuffled
      ? CROSS_DIM_GAIN_FACTOR * this.sfxVolume
      : this.sfxVolume;
    const effectiveGain = this.muted ? 0 : baseGain;
    const channelId = this.nextChannelId++;
    const critical = CRITICAL_SFX.has(name);

    let stopped = false;
    let sourceNode: AudioBufferSourceNode | null = null;
    let gainNode: GainNode | null = null;
    let filterNode: BiquadFilterNode | null = null;

    const cleanup = () => {
      if (stopped) return;
      stopped = true;
      try {
        sourceNode?.stop();
        sourceNode?.disconnect();
        filterNode?.disconnect();
        gainNode?.disconnect();
      } catch {
        // Ignore already stopped nodes
      }
      const idx = this.activeChannels.findIndex((c) => c.id === channelId);
      if (idx !== -1) {
        this.activeChannels.splice(idx, 1);
      }
    };

    const channel: ActiveSfxChannel = {
      id: channelId,
      name,
      critical,
      muffled: isMuffled,
      filterType: isMuffled ? 'lowpass' : 'none',
      filterFrequency: isMuffled ? CROSS_DIM_LOWPASS_HZ : 20000,
      gain: baseGain,
      effectiveGain,
      startedAt: Date.now(),
      stop: cleanup,
    };

    this.activeChannels.push(channel);

    const path = SOUND_EFFECT_PATHS[name];
    if (this.audioCtx && path) {
      const ctx = this.audioCtx;
      gainNode = ctx.createGain();
      gainNode.gain.value = effectiveGain;

      if (isMuffled) {
        filterNode = ctx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = CROSS_DIM_LOWPASS_HZ;
        filterNode.connect(gainNode);
      }
      gainNode.connect(ctx.destination);

      void this.loadAudioBuffer(path).then((buffer) => {
        if (stopped || !buffer || !this.audioCtx) return;
        try {
          sourceNode = ctx.createBufferSource();
          sourceNode.buffer = buffer;
          sourceNode.onended = cleanup;
          if (filterNode) {
            sourceNode.connect(filterNode);
          } else if (gainNode) {
            sourceNode.connect(gainNode);
          }
          sourceNode.start(0);
        } catch {
          cleanup();
        }
      });
    }
  }

  private setLoopState(
    key: LoopKey,
    sound: SoundEffectName,
    active: boolean,
    muffled: boolean,
    playbackRate: number,
    gain: number
  ): void {
    const existing = this.activeLoops[key];
    if (!active) {
      if (existing) {
        existing.stop();
        delete this.activeLoops[key];
      }
      return;
    }

    if (existing && existing.active) {
      existing.updateParams(muffled, playbackRate, gain);
      return;
    }

    this.ensureContextResumed();
    let stopped = false;
    let sourceNode: AudioBufferSourceNode | null = null;
    let gainNode: GainNode | null = null;
    let filterNode: BiquadFilterNode | null = null;

    const ctx = this.audioCtx;
    if (ctx) {
      gainNode = ctx.createGain();
      gainNode.gain.value = this.muted ? 0 : gain;
      filterNode = ctx.createBiquadFilter();
      filterNode.type = 'lowpass';
      filterNode.frequency.value = muffled ? CROSS_DIM_LOWPASS_HZ : 20000;
      filterNode.connect(gainNode);
      gainNode.connect(ctx.destination);

      const path = SOUND_EFFECT_PATHS[sound];
      void this.loadAudioBuffer(path).then((buffer) => {
        if (stopped || !buffer || !this.audioCtx) return;
        try {
          sourceNode = ctx.createBufferSource();
          sourceNode.buffer = buffer;
          sourceNode.loop = true;
          sourceNode.playbackRate.value = playbackRate;
          if (filterNode) {
            sourceNode.connect(filterNode);
          }
          sourceNode.start(0);
        } catch {
          // Ignore start errors
        }
      });
    }

    const loopState: ActiveLoopState = {
      key,
      sound,
      active: true,
      muffled,
      filterFrequency: muffled ? CROSS_DIM_LOWPASS_HZ : 20000,
      playbackRate,
      gain,
      stop: () => {
        if (stopped) return;
        stopped = true;
        loopState.active = false;
        try {
          sourceNode?.stop();
          sourceNode?.disconnect();
          filterNode?.disconnect();
          gainNode?.disconnect();
        } catch {
          // Ignore
        }
      },
      updateParams: (
        newMuffled: boolean,
        newPlaybackRate: number,
        newGain: number
      ) => {
        loopState.muffled = newMuffled;
        loopState.filterFrequency = newMuffled ? CROSS_DIM_LOWPASS_HZ : 20000;
        loopState.playbackRate = newPlaybackRate;
        loopState.gain = newGain;
        if (filterNode) {
          filterNode.frequency.value = loopState.filterFrequency;
        }
        if (gainNode) {
          gainNode.gain.value = this.muted ? 0 : newGain;
        }
        if (sourceNode) {
          sourceNode.playbackRate.value = newPlaybackRate;
        }
      },
    };

    this.activeLoops[key] = loopState;
  }

  public playMusic(name: MusicTrackName, loop: boolean = true): void {
    if (this.currentMusicTrack === name && this.currentMusicStop) {
      return;
    }
    this.stopMusic();
    this.ensureContextResumed();
    this.currentMusicTrack = name;

    let stopped = false;
    let sourceNode: AudioBufferSourceNode | null = null;
    let gainNode: GainNode | null = null;

    if (this.audioCtx) {
      const ctx = this.audioCtx;
      gainNode = ctx.createGain();
      gainNode.gain.value = this.muted ? 0 : this.musicVolume;
      gainNode.connect(ctx.destination);

      const path = MUSIC_TRACK_PATHS[name];
      void this.loadAudioBuffer(path).then((buffer) => {
        if (stopped || !buffer || !this.audioCtx) return;
        try {
          sourceNode = ctx.createBufferSource();
          sourceNode.buffer = buffer;
          sourceNode.loop = loop;
          if (gainNode) {
            sourceNode.connect(gainNode);
          }
          sourceNode.start(0);
        } catch {
          // Ignore
        }
      });
    }

    this.currentMusicUpdateGain = (vol: number) => {
      if (gainNode) {
        gainNode.gain.value = this.muted ? 0 : vol;
      }
    };

    this.currentMusicStop = () => {
      if (stopped) return;
      stopped = true;
      try {
        sourceNode?.stop();
        sourceNode?.disconnect();
        gainNode?.disconnect();
      } catch {
        // Ignore
      }
    };
  }

  public playMusicVolumeTest(name: MusicTrackName = 'ambience2'): void {
    this.playMusic(name, false);
  }

  public stopMusic(): void {
    if (this.currentMusicStop) {
      this.currentMusicStop();
      this.currentMusicStop = null;
    }
    this.currentMusicUpdateGain = null;
    this.currentMusicTrack = null;
  }

  public processGameEvents(
    events: GameEvent[],
    localPlayerId: PlayerId,
    evilOnLeft: boolean,
    lobbyConfig: LobbyConfig,
    localSide: DimensionSide = localPlayerId === 1 ? 'left' : 'right'
  ): void {
    for (const ev of events) {
      if (this.processedEventIds.has(ev.eventId)) {
        continue;
      }
      this.processedEventIds.add(ev.eventId);

      if (ev.type === 'playSound' && ev.sound) {
        let eventSide = ev.side;
        if (!eventSide && ev.world) {
          eventSide = getSideForWorld(ev.world, evilOnLeft);
        }
        if (!eventSide && ev.playerId) {
          eventSide = ev.playerId === 1 ? 'left' : 'right';
        }
        this.playSound(ev.sound, {
          side: eventSide,
          localSide,
          mode: lobbyConfig.mode,
          muffleCrossDimension: lobbyConfig.muffledCrossDimensionAudio,
        });
      }
    }
  }

  public updateAmbientAndLoops(
    state: GameState,
    localPlayerId: PlayerId,
    mode: PlayMode
  ): void {
    if (state.tick < this.lastProcessedTick) {
      this.processedEventIds.clear();
    }
    this.lastProcessedTick = state.tick;

    const localPlayer = state.players[localPlayerId - 1] ?? state.players[0];
    const localSide = localPlayer.side;
    const localWorld = getWorldForSide(localSide, state.evilOnLeft);
    const muffleEnabled =
      mode === 'online' && state.lobbyConfig.muffledCrossDimensionAudio !== false;

    if (state.events.length > 0) {
      this.processGameEvents(
        state.events,
        localPlayerId,
        state.evilOnLeft,
        { ...state.lobbyConfig, mode },
        localSide
      );
    }

    if (
      state.isPaused ||
      state.phase === 'gameOver' ||
      state.phase === 'victory'
    ) {
      this.setLoopState('walk_p1', 'walk', false, false, 1.0, 0);
      this.setLoopState('walk_p2', 'walk', false, false, 1.0, 0);
      this.setLoopState('fire', 'fire', false, false, 1.0, 0);
      this.setLoopState('heartBeat', 'heartBeat', false, false, 1.0, 0);
      this.setLoopState('blobbyTracking', 'blobbyTracking', false, false, 1.0, 0);
      if (state.phase === 'gameOver' || state.phase === 'victory') {
        this.stopMusic();
      }
      return;
    }

    // 1. Independent Footstep Loops (walk_p1 & walk_p2)
    const p1 = state.players[0];
    const p1Moving =
      p1.isAlive &&
      (p1.isMoving || p1.velocity.x !== 0 || p1.velocity.y !== 0);
    const muffleP1 = muffleEnabled && p1.side !== localSide;
    this.setLoopState(
      'walk_p1',
      'walk',
      p1Moving,
      muffleP1,
      1.0,
      muffleP1 ? CROSS_DIM_GAIN_FACTOR * this.sfxVolume : this.sfxVolume
    );

    const p2 = state.players[1];
    const p2Moving =
      p2.isAlive &&
      (p2.isMoving || p2.velocity.x !== 0 || p2.velocity.y !== 0);
    const muffleP2 = muffleEnabled && p2.side !== localSide;
    this.setLoopState(
      'walk_p2',
      'walk',
      p2Moving,
      muffleP2,
      1.0,
      muffleP2 ? CROSS_DIM_GAIN_FACTOR * this.sfxVolume : this.sfxVolume
    );

    // 2. Fire Loop (active when any FireEntity in current room has isOn === true)
    const neutralFireOn = state.room.worlds.neutral.fires.some((f) => f.isOn);
    const dangerousFireOn = state.room.worlds.dangerous.fires.some((f) => f.isOn);
    const anyFireOn = neutralFireOn || dangerousFireOn;
    const fireInLocalWorld =
      localWorld === 'neutral' ? neutralFireOn : dangerousFireOn;
    const muffleFire = muffleEnabled && !fireInLocalWorld;
    this.setLoopState(
      'fire',
      'fire',
      anyFireOn,
      muffleFire,
      1.0,
      muffleFire ? CROSS_DIM_GAIN_FACTOR * this.sfxVolume : this.sfxVolume
    );

    // 3. HeartBeat Loop (Injured/Dying or convergenceDistance <= 2, ramping at 0)
    const relevantPlayers = mode === 'local' ? state.players : [localPlayer];
    const isInjuredOrDying = relevantPlayers.some(
      (p) =>
        p.isAlive && (p.healthState === 'Injured' || p.healthState === 'Dying')
    );
    const isConverging = state.convergenceDistance <= 2;
    const shouldPlayHeartbeat = isInjuredOrDying || isConverging;
    let hbRate = 1.0;
    let hbGain = this.sfxVolume * 0.8;
    if (state.convergenceDistance === 0) {
      hbRate = 1.5;
      hbGain = Math.min(1.0, this.sfxVolume * 1.25);
    } else if (
      state.convergenceDistance <= 2 ||
      relevantPlayers.some((p) => p.healthState === 'Dying')
    ) {
      hbRate = 1.2;
      hbGain = this.sfxVolume * 0.9;
    }
    this.setLoopState(
      'heartBeat',
      'heartBeat',
      shouldPlayHeartbeat,
      false,
      hbRate,
      hbGain
    );

    // 4. Blobby Tracking Loop (when any Blobby is in 'Seeking' state)
    const neutralSeeking = state.room.worlds.neutral.blobbies.filter(
      (b) => b.state === 'Seeking'
    );
    const dangerousSeeking = state.room.worlds.dangerous.blobbies.filter(
      (b) => b.state === 'Seeking'
    );
    const totalSeeking = neutralSeeking.length + dangerousSeeking.length;
    const seekingInLocalWorld =
      (localWorld === 'neutral'
        ? neutralSeeking.length
        : dangerousSeeking.length) > 0;
    const muffleTracking = muffleEnabled && !seekingInLocalWorld;
    this.setLoopState(
      'blobbyTracking',
      'blobbyTracking',
      totalSeeking > 0,
      muffleTracking,
      1.0,
      muffleTracking ? CROSS_DIM_GAIN_FACTOR * this.sfxVolume : this.sfxVolume
    );

    // 5. Dynamic Horror Music Rotation
    const totalBlobbies =
      state.room.worlds.neutral.blobbies.length +
      state.room.worlds.dangerous.blobbies.length;
    const totalEvilLamps =
      state.room.worlds.neutral.evilLamps.length +
      state.room.worlds.dangerous.evilLamps.length;

    if (state.roomName === 'choiceRoom') {
      if (this.currentMusicTrack !== 'piano') {
        this.playMusic('piano', true);
      }
    } else if (state.room.tears.length >= 5 || totalSeeking >= 2) {
      if (this.currentMusicTrack !== 'crazyPiano') {
        this.playMusic('crazyPiano', true);
      }
    } else if (totalBlobbies > 0 || totalEvilLamps > 0) {
      if (
        !this.currentMusicTrack ||
        !THREAT_MUSIC_LIST.includes(this.currentMusicTrack)
      ) {
        const idx = Math.abs(state.roomsEntered + state.tick) % THREAT_MUSIC_LIST.length;
        this.playMusic(THREAT_MUSIC_LIST[idx], true);
      }
    } else {
      if (
        !this.currentMusicTrack ||
        !NO_THREAT_MUSIC_LIST.includes(this.currentMusicTrack)
      ) {
        const idx =
          Math.abs(state.roomsEntered + state.tick) % NO_THREAT_MUSIC_LIST.length;
        this.playMusic(NO_THREAT_MUSIC_LIST[idx], true);
      }
    }

    // 6. Subtle ambient creaking stingers in dark corridors
    this.ambientCreakCounter++;
    if (this.ambientCreakCounter >= 1200) {
      this.ambientCreakCounter = 0;
      const creaks: SoundEffectName[] = [
        'creaking1',
        'creaking2',
        'creaking3',
        'creaking4',
      ];
      const creak = creaks[Math.abs(state.tick) % creaks.length];
      this.playSound(creak);
    }
  }

  public setSFXVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    for (const loop of Object.values(this.activeLoops)) {
      if (loop && loop.active) {
        const baseGain = loop.muffled
          ? CROSS_DIM_GAIN_FACTOR * this.sfxVolume
          : this.sfxVolume;
        loop.updateParams(loop.muffled, loop.playbackRate, baseGain);
      }
    }
  }

  public getSFXVolume(): number {
    return this.sfxVolume;
  }

  public setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    this.currentMusicUpdateGain?.(this.musicVolume);
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    this.currentMusicUpdateGain?.(this.musicVolume);
    for (const loop of Object.values(this.activeLoops)) {
      if (loop && loop.active) {
        loop.updateParams(loop.muffled, loop.playbackRate, loop.gain);
      }
    }
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public stopAll(): void {
    for (const ch of [...this.activeChannels]) {
      ch.stop();
    }
    this.activeChannels = [];

    for (const key of Object.keys(this.activeLoops) as LoopKey[]) {
      this.activeLoops[key]?.stop();
      delete this.activeLoops[key];
    }

    this.stopMusic();
  }

  public getActiveChannelCount(): number {
    return this.activeChannels.length;
  }

  public getActiveChannels(): ActiveSfxChannel[] {
    return [...this.activeChannels];
  }

  public getActiveLoops(): Partial<Record<LoopKey, ActiveLoopState>> {
    return { ...this.activeLoops };
  }

  public getCurrentMusicTrack(): MusicTrackName | null {
    return this.currentMusicTrack;
  }
}
