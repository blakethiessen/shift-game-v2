// src/app.ts
// Top-level application coordinator connecting GameEngine, GameRenderer,
// PeerManager, AudioManager, InputManager, and MenuSystem.

import { AudioManager } from './audio/audioManager';
import { GameEngine } from './core/gameEngine';
import { InputManager } from './input/inputManager';
import { MobileControls } from './input/mobileControls';
import { PeerManager } from './net/peerManager';
import { EventDeduplicator, InputSequenceTracker } from './net/protocol';
import {
  CAMERA_ZOOM_PRESETS,
  CAMERA_ZOOM_STEP,
  DEFAULT_CAMERA_ZOOM,
  DEFAULT_WINDOW_SCALE_MODE,
  GameRenderer,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  WINDOW_SCALE_MODES,
  computeWindowStageLayout,
} from './renderer/gameRenderer';
import {
  DIM_HEIGHT_TILES,
  DIM_WIDTH_PX,
  DIM_WIDTH_TILES,
  FULL_VIEWPORT_HEIGHT_PX,
  FULL_VIEWPORT_WIDTH_PX,
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
  WindowScaleMode,
  createDefaultLobbyConfig,
} from './shared/types';
import { MenuSystem } from './ui/menuSystem';

export const CAMERA_ZOOM_STORAGE_KEY = 'shift_game_camera_zoom_v1';
export const WINDOW_SCALE_STORAGE_KEY = 'shift_game_window_scale_v1';

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
  private cameraZoom: number = DEFAULT_CAMERA_ZOOM;
  private windowScaleMode: WindowScaleMode = DEFAULT_WINDOW_SCALE_MODE;
  private running = false;
  private clientTickCounter = 0;
  private lastProcessedClientTick = 0;

  private zoomHudEl: HTMLElement | null = null;
  private zoomHudSliderEl: HTMLInputElement | null = null;
  private zoomHudValueEl: HTMLButtonElement | null = null;
  private zoomHudScaleBtnEl: HTMLButtonElement | null = null;

  private accumulatorMs = 0;
  private lastFrameTimestamp = 0;
  private rafId: number | null = null;
  private readonly boundDebugKeyDown: (e: Event) => void;
  private readonly boundWindowResize: () => void;
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

    this.cameraZoom = this.loadInitialCameraZoom();
    this.windowScaleMode = this.loadInitialWindowScaleMode();

    this.mobileControls = new MobileControls({
      container: this.container,
      inputManager: this.inputManager,
      forceEnabled: options.mobileControlsEnabled ?? null,
      canvasFactory: options.canvasFactory,
      onZoomDelta: (delta) => {
        this.adjustCameraZoom(delta);
      },
      onZoomCycle: () => {
        this.cycleCameraZoom();
      },
      onAutoEnable: () => {
        this.updateZoomHudVisibility();
        this.updateWindowStageScale();
      },
    });
    this.mobileControls.setZoomDisplay(this.cameraZoom);

    this.createZoomHud();

    this.inputManager.onMuteToggle(() => {
      this.audioManager.toggleMute();
    });

    this.inputManager.onPauseToggle(() => {
      if (!this.running) return;
      const state = this.engine.getState();
      state.isPaused = !state.isPaused;
      this.renderCurrentState(0);
    });

    this.boundDebugKeyDown = (ev: Event) => {
      const e = ev as KeyboardEvent;
      if (!this.running || e.repeat || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      const state = this.engine.getState();
      if (state.phase === 'gameOver' || state.phase === 'victory') {
        return;
      }
      const settings = this.inputManager.getSettings();
      const isCodeBound =
        Object.values(settings.p1).includes(e.code) ||
        Object.values(settings.p2).includes(e.code) ||
        Object.values(settings.common).includes(e.code);
      if (isCodeBound) {
        return;
      }

      if (e.code === 'KeyY') {
        this.lightingEnabled = !this.lightingEnabled;
        this.renderCurrentState(0);
      } else if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        this.adjustCameraZoom(CAMERA_ZOOM_STEP);
      } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        this.adjustCameraZoom(-CAMERA_ZOOM_STEP);
      } else if (e.code === 'Digit0' || e.code === 'Numpad0') {
        this.setCameraZoom(DEFAULT_CAMERA_ZOOM);
      }
    };
    if (this.inputEventTarget) {
      this.inputEventTarget.addEventListener('keydown', this.boundDebugKeyDown);
    }

    this.boundWindowResize = () => {
      this.updateWindowStageScale();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.boundWindowResize);
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
        this.updateZoomHudVisibility();
        this.inputManager.setEnabled(false);
        this.mobileControls.setSessionMode(this.mode, this.localPlayerId, false);
        this.audioManager.stopAll();
        this.clientInputTracker.reset();
        this.renderer.resizeForMode('local');
        this.menuSystem.showScreen('lobby');
        this.updateWindowStageScale();
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
          this.updateZoomHudVisibility();
          this.updateWindowStageScale();
        },
        getMobileControlsForceState: () =>
          this.mobileControls.getForceEnabled(),
        onCameraZoomChange: (zoom) => {
          this.setCameraZoom(zoom);
        },
        getCameraZoom: () => this.cameraZoom,
        onWindowScaleModeChange: (scaleMode) => {
          this.setWindowScaleMode(scaleMode);
        },
        getWindowScaleMode: () => this.windowScaleMode,
        onScreenChange: () => {
          if (!this.menuSystem) return;
          this.updateWindowStageScale();
        },
      },
    });

    this.updateWindowStageScale();

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
    this.updateZoomHudVisibility();
    this.updateWindowStageScale();
  }

  public getWindowScaleMode(): WindowScaleMode {
    return this.windowScaleMode;
  }

  public setWindowScaleMode(mode: WindowScaleMode): void {
    const safeMode: WindowScaleMode = WINDOW_SCALE_MODES.includes(mode)
      ? mode
      : DEFAULT_WINDOW_SCALE_MODE;
    this.windowScaleMode = safeMode;
    this.saveWindowScaleMode(safeMode);
    this.syncZoomHudDisplay();
    this.updateWindowStageScale();
  }

  public cycleWindowScaleMode(): WindowScaleMode {
    const idx = WINDOW_SCALE_MODES.indexOf(this.windowScaleMode);
    const next =
      WINDOW_SCALE_MODES[(idx + 1) % WINDOW_SCALE_MODES.length] ??
      DEFAULT_WINDOW_SCALE_MODE;
    this.setWindowScaleMode(next);
    return this.windowScaleMode;
  }

  private loadInitialWindowScaleMode(): WindowScaleMode {
    const isValidMode = (val: string | null): val is WindowScaleMode =>
      val !== null && (WINDOW_SCALE_MODES as readonly string[]).includes(val);

    if (typeof window !== 'undefined' && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const urlScale = params.get('scale');
      if (isValidMode(urlScale)) {
        return urlScale;
      }
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(WINDOW_SCALE_STORAGE_KEY);
        if (isValidMode(saved)) {
          return saved;
        }
      } catch {
        // Ignore storage errors
      }
    }
    return DEFAULT_WINDOW_SCALE_MODE;
  }

  private saveWindowScaleMode(mode: WindowScaleMode): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(WINDOW_SCALE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage errors
    }
  }

  private formatHudScaleLabel(mode: WindowScaleMode): string {
    switch (mode) {
      case 'fit':
        return 'SCALE: FIT';
      case 'integer':
        return 'SCALE: INT';
      case 'stretch':
        return 'SCALE: FULL';
      case 'native':
        return 'SCALE: 1X';
    }
  }

  public updateWindowStageScale(): void {
    const menuVisible = this.menuSystem ? this.menuSystem.isVisible() : true;
    const isSingleDimensionView =
      this.running && this.mode === 'online' && !menuVisible;
    const baseWidth = isSingleDimensionView
      ? DIM_WIDTH_PX
      : FULL_VIEWPORT_WIDTH_PX;
    const baseHeight = FULL_VIEWPORT_HEIGHT_PX;

    const rawViewportWidth =
      typeof window !== 'undefined' && window.innerWidth > 0
        ? window.innerWidth
        : baseWidth;
    const rawViewportHeight =
      typeof window !== 'undefined' && window.innerHeight > 0
        ? window.innerHeight
        : baseHeight;

    const isOnlineMobileOverlay =
      this.mobileControls?.isEnabled() && isSingleDimensionView;
    const availHeight = isOnlineMobileOverlay
      ? Math.max(1, rawViewportHeight - 110)
      : rawViewportHeight;

    const layout = computeWindowStageLayout(
      rawViewportWidth,
      availHeight,
      baseWidth,
      baseHeight,
      this.windowScaleMode
    );

    this.canvas.style.width = `${layout.width}px`;
    this.canvas.style.height = `${layout.height}px`;
    this.canvas.setAttribute('data-scale-mode', layout.mode);

    const stageEl =
      this.canvas.parentElement?.id === 'game-stage'
        ? this.canvas.parentElement
        : null;

    const menuEl = this.container.querySelector(
      '.shift-menu-overlay'
    ) as HTMLElement | null;

    if (menuVisible && menuEl) {
      const currentScreen = this.menuSystem ? this.menuSystem.getCurrentScreen() : 'start';
      const isBannerScreen =
        currentScreen === 'gameOver' || currentScreen === 'victory';
      const isCompactMobileMenu =
        rawViewportWidth <= 768 &&
        this.windowScaleMode !== 'native' &&
        !isBannerScreen;
      menuEl.classList.toggle('is-compact-mobile', isCompactMobileMenu);

      if (isCompactMobileMenu) {
        menuEl.style.transform = '';
        menuEl.style.transformOrigin = '';
        if (stageEl) {
          stageEl.style.width = `${rawViewportWidth}px`;
          stageEl.style.height = `${rawViewportHeight}px`;
          stageEl.setAttribute('data-scale-mode', layout.mode);
        }
      } else {
        const menuLayout = computeWindowStageLayout(
          rawViewportWidth,
          rawViewportHeight,
          FULL_VIEWPORT_WIDTH_PX,
          FULL_VIEWPORT_HEIGHT_PX,
          this.windowScaleMode
        );
        menuEl.style.transform = `scale(${menuLayout.scaleX}, ${menuLayout.scaleY})`;
        menuEl.style.transformOrigin = 'center center';
        if (stageEl) {
          stageEl.style.width = `${menuLayout.width}px`;
          stageEl.style.height = `${menuLayout.height}px`;
          stageEl.setAttribute('data-scale-mode', layout.mode);
        }
      }
    } else {
      if (menuEl) {
        menuEl.classList.remove('is-compact-mobile');
        menuEl.style.transform = '';
        menuEl.style.transformOrigin = '';
      }
      if (stageEl) {
        stageEl.style.width = `${layout.width}px`;
        stageEl.style.height = `${layout.height}px`;
        stageEl.setAttribute('data-scale-mode', layout.mode);
      }
    }
  }

  public getCameraZoom(): number {
    return this.cameraZoom;
  }

  public setCameraZoom(zoom: number): void {
    const safe = Number.isFinite(zoom) ? zoom : DEFAULT_CAMERA_ZOOM;
    const clamped = Math.max(
      MIN_CAMERA_ZOOM,
      Math.min(MAX_CAMERA_ZOOM, Math.round(safe * 100) / 100)
    );
    this.cameraZoom = clamped;
    this.saveCameraZoom(clamped);
    this.mobileControls.setZoomDisplay(clamped);
    this.syncZoomHudDisplay();
    if (this.running) {
      this.renderCurrentState(0);
    }
  }

  public adjustCameraZoom(delta: number): number {
    this.setCameraZoom(this.cameraZoom + delta);
    return this.cameraZoom;
  }

  public cycleCameraZoom(): number {
    const nextPreset = CAMERA_ZOOM_PRESETS.find(
      (p) => p > this.cameraZoom + 0.01
    );
    const target = nextPreset ?? CAMERA_ZOOM_PRESETS[0];
    this.setCameraZoom(target);
    return this.cameraZoom;
  }

  private loadInitialCameraZoom(): number {
    const clampZoom = (val: number) =>
      Math.max(
        MIN_CAMERA_ZOOM,
        Math.min(MAX_CAMERA_ZOOM, Math.round(val * 100) / 100)
      );

    if (typeof window !== 'undefined' && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const urlZoom = params.get('zoom');
      if (urlZoom !== null) {
        const parsed = parseFloat(urlZoom);
        if (Number.isFinite(parsed)) {
          return clampZoom(parsed);
        }
      }
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(CAMERA_ZOOM_STORAGE_KEY);
        if (saved !== null) {
          const parsed = parseFloat(saved);
          if (Number.isFinite(parsed)) {
            return clampZoom(parsed);
          }
        }
      } catch {
        // Ignore storage errors
      }
    }
    return DEFAULT_CAMERA_ZOOM;
  }

  private saveCameraZoom(zoom: number): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(CAMERA_ZOOM_STORAGE_KEY, String(zoom));
    } catch {
      // Ignore storage errors
    }
  }

  private formatZoomReadout(zoom: number): string {
    const zText = `${Number(zoom.toFixed(2))}x`;
    const tilesW = Number((DIM_WIDTH_TILES / zoom).toFixed(1));
    const tilesH = Number((DIM_HEIGHT_TILES / zoom).toFixed(1));
    return `${zText} (${tilesW}×${tilesH} tiles)`;
  }

  private createZoomHud(): void {
    const bar = document.createElement('div');
    bar.className = 'shift-zoom-hud is-hidden';
    bar.setAttribute('data-testid', 'shift-zoom-hud');

    const label = document.createElement('span');
    label.className = 'zoom-hud-label';
    label.textContent = 'ZOOM';

    const outBtn = document.createElement('button');
    outBtn.type = 'button';
    outBtn.className = 'zoom-hud-btn';
    outBtn.setAttribute('data-testid', 'hud-zoom-out');
    outBtn.setAttribute('title', 'Zoom Out (-)');
    outBtn.textContent = '-';
    outBtn.addEventListener('mousedown', (e) => e.preventDefault());
    outBtn.addEventListener('click', () => {
      this.adjustCameraZoom(-CAMERA_ZOOM_STEP);
      outBtn.blur();
    });

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'zoom-hud-slider';
    slider.setAttribute('data-testid', 'hud-zoom-slider');
    slider.setAttribute('aria-label', 'Viewport Zoom');
    slider.min = String(MIN_CAMERA_ZOOM);
    slider.max = String(MAX_CAMERA_ZOOM);
    slider.step = '0.05';
    slider.value = String(this.cameraZoom);
    const onSliderInput = () => {
      const val = parseFloat(slider.value);
      if (Number.isFinite(val)) {
        this.setCameraZoom(val);
      }
    };
    slider.addEventListener('input', onSliderInput);
    slider.addEventListener('change', () => {
      onSliderInput();
      slider.blur();
    });
    slider.addEventListener('pointerup', () => slider.blur());
    slider.addEventListener('mouseup', () => slider.blur());
    slider.addEventListener('keydown', (e) => {
      e.preventDefault();
      slider.blur();
    });

    const valueBtn = document.createElement('button');
    valueBtn.type = 'button';
    valueBtn.className = 'zoom-hud-value';
    valueBtn.setAttribute('data-testid', 'hud-zoom-value');
    valueBtn.setAttribute('title', 'Click to cycle preset zoom (0 to reset)');
    valueBtn.textContent = this.formatZoomReadout(this.cameraZoom);
    valueBtn.addEventListener('mousedown', (e) => e.preventDefault());
    valueBtn.addEventListener('click', () => {
      this.cycleCameraZoom();
      valueBtn.blur();
    });

    const inBtn = document.createElement('button');
    inBtn.type = 'button';
    inBtn.className = 'zoom-hud-btn';
    inBtn.setAttribute('data-testid', 'hud-zoom-in');
    inBtn.setAttribute('title', 'Zoom In (+)');
    inBtn.textContent = '+';
    inBtn.addEventListener('mousedown', (e) => e.preventDefault());
    inBtn.addEventListener('click', () => {
      this.adjustCameraZoom(CAMERA_ZOOM_STEP);
      inBtn.blur();
    });

    bar.appendChild(label);
    bar.appendChild(outBtn);
    bar.appendChild(slider);
    bar.appendChild(valueBtn);
    bar.appendChild(inBtn);

    const scaleBtn = document.createElement('button');
    scaleBtn.type = 'button';
    scaleBtn.className = 'zoom-hud-btn';
    scaleBtn.setAttribute('data-testid', 'hud-window-scale');
    scaleBtn.setAttribute('title', 'Cycle Window Scale Mode');
    scaleBtn.textContent = this.formatHudScaleLabel(this.windowScaleMode);
    scaleBtn.addEventListener('mousedown', (e) => e.preventDefault());
    scaleBtn.addEventListener('click', () => {
      this.cycleWindowScaleMode();
      scaleBtn.blur();
    });
    bar.appendChild(scaleBtn);

    this.container.appendChild(bar);
    this.zoomHudEl = bar;
    this.zoomHudSliderEl = slider;
    this.zoomHudValueEl = valueBtn;
    this.zoomHudScaleBtnEl = scaleBtn;
  }

  private syncZoomHudDisplay(): void {
    if (this.zoomHudSliderEl) {
      this.zoomHudSliderEl.value = String(this.cameraZoom);
    }
    if (this.zoomHudValueEl) {
      this.zoomHudValueEl.textContent = this.formatZoomReadout(this.cameraZoom);
    }
    if (this.zoomHudScaleBtnEl) {
      this.zoomHudScaleBtnEl.textContent = this.formatHudScaleLabel(
        this.windowScaleMode
      );
    }
  }

  private updateZoomHudVisibility(): void {
    if (!this.zoomHudEl) return;
    const state = this.engine.getState();
    const inActivePlay =
      this.running &&
      state.phase !== 'gameOver' &&
      state.phase !== 'victory';
    this.zoomHudEl.classList.toggle('is-hidden', !inActivePlay);
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
    this.updateZoomHudVisibility();
    this.updateWindowStageScale();
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
    this.updateZoomHudVisibility();
    this.updateWindowStageScale();
    this.audioManager.playSound('doorClosing');
    this.renderCurrentState(0);
  }

  public returnToTitle(): void {
    this.running = false;
    this.updateZoomHudVisibility();
    this.inputManager.setEnabled(false);
    this.mobileControls.setSessionMode(this.mode, this.localPlayerId, false);
    this.audioManager.stopAll();
    if (this.mode === 'online') {
      this.peerManager.disconnect();
    }
    this.renderer.resizeForMode('local');
    this.menuSystem.showScreen('start');
    this.updateWindowStageScale();
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
      this.updateZoomHudVisibility();
      this.menuSystem.showScreen('gameOver');
    } else if (
      state.phase === 'victory' &&
      this.menuSystem.getCurrentScreen() !== 'victory'
    ) {
      this.inputManager.setEnabled(false);
      this.mobileControls.setSessionMode(this.mode, this.localPlayerId, false);
      this.updateZoomHudVisibility();
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
    const keyStrings = this.mobileControls.isEnabled()
      ? {
          p1: {
            ...formattedKeys.p1,
            UseItem: 'USE',
            Interact: 'ACT',
            Inventory: 'INV',
            Ping: 'PING',
          },
          p2: {
            ...formattedKeys.p2,
            UseItem: 'USE',
            Interact: 'ACT',
            Inventory: 'INV',
            Ping: 'PING',
          },
          common: {
            ...formattedKeys.common,
            SwitchDimensions: 'SHIFT',
          },
        }
      : formattedKeys;
    this.renderer.render(
      state,
      {
        localPlayerId: this.localPlayerId,
        mode: this.mode,
        partnerVisibility: this.lobbyConfig.partnerVisibility,
        lightingEnabled: this.lightingEnabled,
        cameraZoom: this.cameraZoom,
        keyStrings,
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
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.boundWindowResize);
    }
    this.zoomHudEl?.remove();
    this.mobileControls.destroy();
    this.inputManager.destroy();
    this.menuSystem.destroy();
    this.peerManager.disconnect();
    this.audioManager.stopAll();
  }
}
