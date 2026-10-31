// src/app.ts
// Top-level application coordinator connecting GameEngine, GameRenderer,
// PeerManager, AudioManager, InputManager, and MenuSystem.

import { AudioManager } from './audio/audioManager';
import { GameEngine } from './core/gameEngine';
import { InputManager } from './input/inputManager';
import { MobileControls } from './input/mobileControls';
import { PeerManager } from './net/peerManager';
import { EventDeduplicator, InputSequenceTracker } from './net/protocol';
import { GameRenderer } from './renderer/gameRenderer';
import {
  GameEvent,
  GameState,
  IAudioManager,
  IGameRenderer,
  IPeerManager,
  LobbyConfig,
  NetPacket,
  PlayerId,
  PlayMode,
  SIMULATION_TICK_MS,
  createDefaultLobbyConfig,
} from './shared/types';
import { MenuSystem } from './ui/menuSystem';

export interface ShiftGameAppOptions {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  spritesheetImage?: CanvasImageSource | null;
  canvasFactory?: (w: number, h: number) => HTMLCanvasElement;
  audioManager?: IAudioManager;
  peerManager?: IPeerManager;
  inputTarget?: EventTarget | null;
  autoStartLoop?: boolean;
  seed?: number;
  mobileControlsEnabled?: boolean | null;
}

export class ShiftGameApp {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly engine: GameEngine;
  private readonly renderer: IGameRenderer;
  private readonly audioManager: IAudioManager;
  private readonly inputManager: InputManager;
  private readonly mobileControls: MobileControls;
  private readonly peerManager: IPeerManager;
  private readonly menuSystem: MenuSystem;

  private readonly clientInputTracker = new InputSequenceTracker();
  private readonly eventDeduplicator = new EventDeduplicator();

  private mode: PlayMode = 'local';
  private isOnlineHost = true;
  private localPlayerId: PlayerId = 1;
  private lobbyConfig: LobbyConfig = createDefaultLobbyConfig();
  private lightingEnabled = true;
  private running = false;
  private clientTickCounter = 0;
  private lastProcessedClientTick = 0;

  private accumulatorMs = 0;
  private lastFrameTimestamp = 0;
  private rafId: number | null = null;
  private readonly boundDebugKeyDown: (e: Event) => void;
  private readonly inputEventTarget: EventTarget | null;

  constructor(options: ShiftGameAppOptions) {
    this.container = options.container;
    this.canvas = options.canvas;
    this.engine = new GameEngine(options.seed);
    this.renderer = new GameRenderer(
      options.canvas,
      options.spritesheetImage ?? null,
      options.canvasFactory
    );
    this.audioManager = options.audioManager ?? new AudioManager();
    this.peerManager = options.peerManager ?? new PeerManager();

    this.inputEventTarget =
      options.inputTarget !== undefined
        ? options.inputTarget
        : typeof window !== 'undefined'
        ? window
        : null;

    this.inputManager = new InputManager({
      mode: 'local',
      localPlayerId: 1,
      target: this.inputEventTarget,
    });
    this.inputManager.setEnabled(false);

    this.mobileControls = new MobileControls({
      container: this.container,
      inputManager: this.inputManager,
      forceEnabled: options.mobileControlsEnabled ?? null,
      canvasFactory: options.canvasFactory,
    });

    this.inputManager.onMuteToggle(() => {
      this.audioManager.toggleMute();
    });

    this.inputManager.onPauseToggle(() => {
      if (!this.running) return;
      const state = this.engine.getState();
      state.isPaused = !state.isPaused;
    });

    this.boundDebugKeyDown = (ev: Event) => {
      const e = ev as KeyboardEvent;
      if (!this.running) return;
      if (e.code === 'KeyY' && !e.repeat) {
        this.lightingEnabled = !this.lightingEnabled;
      }
    };
    if (this.inputEventTarget) {
      this.inputEventTarget.addEventListener('keydown', this.boundDebugKeyDown);
    }

    // Subscribe to P2P network packets and mid-game disconnect/error events
    this.peerManager.onPacket((packet: NetPacket) => {
      this.handleNetPacket(packet);
    });
    this.peerManager.onStateChange((state) => {
      if (
        this.running &&
        this.mode === 'online' &&
        (state === 'disconnected' || state === 'error')
      ) {
        this.running = false;
        this.inputManager.setEnabled(false);
        this.mobileControls.setSessionMode(this.mode, this.localPlayerId, false);
        this.audioManager.stopAll();
        this.clientInputTracker.reset();
        this.renderer.resizeForMode('local');
        this.menuSystem.showScreen('lobby');
      }
    });

    this.menuSystem = new MenuSystem({
      container: this.container,
      audioManager: this.audioManager,
      inputManager: this.inputManager,
      peerManager: this.peerManager,
      callbacks: {
        onStartLocalGame: (config) => this.startLocalGame(config),
        onStartOnlineGame: (config, isHost) =>
          this.startOnlineGame(config, isHost),
        onReturnToTitle: () => this.returnToTitle(),
        onLobbyConfigChange: (config) => {
          this.lobbyConfig = { ...config };
          this.engine.setLobbyConfig(this.lobbyConfig);
        },
        onMobileControlsChange: (forceEnabled) => {
          this.mobileControls.setForceEnabled(forceEnabled);
        },
        getMobileControlsForceState: () =>
          this.mobileControls.getForceEnabled(),
      },
    });

    if (options.autoStartLoop !== false && typeof window !== 'undefined') {
      this.startAnimationFrameLoop();
    }
  }

  public setSpritesheet(image: CanvasImageSource): void {
    if (this.renderer instanceof GameRenderer) {
      this.renderer.setSpritesheet(image);
    }
  }

  public getEngine(): GameEngine {
    return this.engine;
  }

  public getState(): GameState {
    return this.engine.getState();
  }

  public getMenuSystem(): MenuSystem {
    return this.menuSystem;
  }

  public getMobileControls(): MobileControls {
    return this.mobileControls;
  }

  public setMobileControlsEnabled(enabled: boolean | null): void {
    this.mobileControls.setForceEnabled(enabled);
  }

  public getLocalPlayerId(): PlayerId {
    return this.localPlayerId;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public startLocalGame(config: Partial<LobbyConfig> = {}): void {
    void this.audioManager.init();
    this.mode = 'local';
    this.isOnlineHost = true;
    this.localPlayerId = 1;
    this.lobbyConfig = {
      ...createDefaultLobbyConfig(),
      ...config,
      mode: 'local',
    };

    this.eventDeduplicator.reset();
    this.clientInputTracker.reset();
    this.engine.resetGame();
    this.engine.setLobbyConfig(this.lobbyConfig);

    this.inputManager.setPlayMode('local', 1);
    this.inputManager.setEnabled(true);
    this.renderer.resizeForMode('local');
    this.menuSystem.hide();
    this.mobileControls.setSessionMode('local', 1, true);

    this.running = true;
    this.accumulatorMs = 0;
    this.audioManager.playSound('doorClosing');
    this.renderCurrentState(0);
  }

  public startOnlineGame(config: LobbyConfig, isHost: boolean): void {
    void this.audioManager.init();
    this.mode = 'online';
    this.isOnlineHost = isHost;
    this.localPlayerId = isHost ? 1 : 2;
    this.lobbyConfig = { ...config, mode: 'online' };

    this.eventDeduplicator.reset();
    this.clientInputTracker.reset();
    this.clientTickCounter = 0;
    this.lastProcessedClientTick = 0;

    if (isHost) {
      this.engine.resetGame();
      this.engine.setLobbyConfig(this.lobbyConfig);
    } else {
      this.engine.setLobbyConfig(this.lobbyConfig);
    }

    this.inputManager.setPlayMode('online', this.localPlayerId);
    this.inputManager.setEnabled(true);
    this.renderer.resizeForMode('online');
    this.menuSystem.hide();
    this.mobileControls.setSessionMode('online', this.localPlayerId, true);

    this.running = true;
    this.accumulatorMs = 0;
    this.audioManager.playSound('doorClosing');
    this.renderCurrentState(0);
  }

  public returnToTitle(): void {
    this.running = false;
    this.inputManager.setEnabled(false);
    this.mobileControls.setSessionMode(this.mode, this.localPlayerId, false);
    this.audioManager.stopAll();
    if (this.mode === 'online') {
      this.peerManager.disconnect();
    }
    this.renderer.resizeForMode('local');
    this.menuSystem.showScreen('start');
  }

  private handleNetPacket(packet: NetPacket): void {
    if (!this.running || this.mode !== 'online') {
      return;
    }

    if (packet.type === 'input' && this.isOnlineHost) {
      this.lastProcessedClientTick = Math.max(
        this.lastProcessedClientTick,
        packet.clientTick
      );
      this.clientInputTracker.receivePacket(packet);
    } else if (packet.type === 'state' && !this.isOnlineHost) {
      this.engine.setState(packet.state);
      const state = this.engine.getState();
      const newEvents = this.eventDeduplicator.extractFromState(state);
      this.processGameEvents(newEvents);
      this.audioManager.updateAmbientAndLoops(
        state,
        this.localPlayerId,
        this.mode
      );
      this.checkPhaseOverlayTransitions(state);
    }
  }

  private processGameEvents(events: GameEvent[]): void {
    // Note: 'playSound' GameEvents are handled directly by audioManager.updateAmbientAndLoops()
    // with internal eventId deduplication and cross-dimension low-pass filtering.
    for (const ev of events) {
      if (ev.type === 'flashScreen' && ev.color) {
        this.renderer.triggerFlash(ev.color, ev.durationMs, ev.maxOpacity);
      }
    }
  }

  private checkPhaseOverlayTransitions(state: GameState): void {
    if (
      state.phase === 'gameOver' &&
      this.menuSystem.getCurrentScreen() !== 'gameOver'
    ) {
      this.inputManager.setEnabled(false);
      this.mobileControls.setSessionMode(this.mode, this.localPlayerId, false);
      this.menuSystem.showScreen('gameOver');
    } else if (
      state.phase === 'victory' &&
      this.menuSystem.getCurrentScreen() !== 'victory'
    ) {
      this.inputManager.setEnabled(false);
      this.mobileControls.setSessionMode(this.mode, this.localPlayerId, false);
      this.menuSystem.showScreen('victory');
    }
  }

  /**
   * Steps the game by dtMs milliseconds (can be called directly in tests or from RAF).
   */
  public stepFrame(dtMs: number): void {
    if (!this.running) {
      return;
    }

    this.accumulatorMs += Math.min(dtMs, 250);

    while (this.accumulatorMs >= SIMULATION_TICK_MS) {
      this.accumulatorMs -= SIMULATION_TICK_MS;

      if (this.mode === 'local') {
        const p1Input = this.inputManager.getPlayerInput(1);
        const p2Input = this.inputManager.getPlayerInput(2);
        const state = this.engine.tick(SIMULATION_TICK_MS, p1Input, p2Input);
        const newEvents = this.eventDeduplicator.extractFromState(state);
        this.processGameEvents(newEvents);
        this.audioManager.updateAmbientAndLoops(
          state,
          this.localPlayerId,
          this.mode
        );
        this.checkPhaseOverlayTransitions(state);
      } else if (this.isOnlineHost) {
        // Online Host (Player 1, Left side):
        // Note: In Online Mode, pressing Shift on Host should only increment p1Input.shiftRequestSeq,
        // while p2Input comes strictly from the remote Client's InputSequenceTracker!
        const p1Input = this.inputManager.getPlayerInput(1);
        const p2Input = this.clientInputTracker.consumeForTick();
        const state = this.engine.tick(SIMULATION_TICK_MS, p1Input, p2Input);

        const newEvents = this.eventDeduplicator.extractFromState(state);
        this.processGameEvents(newEvents);
        this.audioManager.updateAmbientAndLoops(
          state,
          this.localPlayerId,
          this.mode
        );
        this.checkPhaseOverlayTransitions(state);

        this.peerManager.sendPacket({
          type: 'state',
          hostTick: state.tick,
          lastProcessedClientTick: this.lastProcessedClientTick,
          state,
        });
      } else {
        // Online Client (Player 2, Right side):
        // Send local input packet to Host
        this.clientTickCounter++;
        const localInput = this.inputManager.getPlayerInput(2);
        this.peerManager.sendPacket({
          type: 'input',
          playerId: 2,
          clientTick: this.clientTickCounter,
          input: localInput,
        });
      }
    }

    this.renderCurrentState(dtMs);
  }

  private renderCurrentState(dtMs: number): void {
    const state = this.engine.getState();
    const formattedKeys = this.inputManager.getFormattedKeyStrings();
    this.renderer.render(
      state,
      {
        localPlayerId: this.localPlayerId,
        mode: this.mode,
        partnerVisibility: this.lobbyConfig.partnerVisibility,
        lightingEnabled: this.lightingEnabled,
        keyStrings: formattedKeys,
      },
      dtMs
    );
    this.mobileControls.syncFromMainCanvas(this.canvas, state);
  }

  private startAnimationFrameLoop(): void {
    const loop = (timestamp: number) => {
      if (this.lastFrameTimestamp === 0) {
        this.lastFrameTimestamp = timestamp;
      }
      const dtMs = timestamp - this.lastFrameTimestamp;
      this.lastFrameTimestamp = timestamp;

      if (this.running) {
        this.stepFrame(dtMs);
      }
      this.rafId = window.requestAnimationFrame(loop);
    };
    this.rafId = window.requestAnimationFrame(loop);
  }

  public destroy(): void {
    this.running = false;
    if (this.rafId !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.inputEventTarget) {
      this.inputEventTarget.removeEventListener(
        'keydown',
        this.boundDebugKeyDown
      );
    }
    this.mobileControls.destroy();
    this.inputManager.destroy();
    this.menuSystem.destroy();
    this.peerManager.disconnect();
    this.audioManager.stopAll();
  }
}
