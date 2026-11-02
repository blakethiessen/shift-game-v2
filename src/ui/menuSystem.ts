import {
  CommonKeyBindings,
  ConnectionState,
  DevicePlatform,
  IAudioManager,
  IInputManager,
  IPeerManager,
  LobbyConfig,
  NetPacket,
  PlayerKeyBindings,
  WindowScaleMode,
  createDefaultLobbyConfig,
} from '../shared/types';
import {
  DEFAULT_WINDOW_SCALE_MODE,
  WINDOW_SCALE_MODES,
} from '../renderer/gameRenderer';

export type MenuScreen =
  | 'start'
  | 'lobby'
  | 'options'
  | 'controls'
  | 'sound'
  | 'tutorial'
  | 'credits'
  | 'gameOver'
  | 'victory'
  | 'hidden';

export interface MenuCallbacks {
  onStartLocalGame?: (config: LobbyConfig) => void;
  onStartOnlineGame?: (config: LobbyConfig, isHost: boolean) => void;
  onReturnToTitle?: () => void;
  onLobbyConfigChange?: (config: LobbyConfig) => void;
  onMobileControlsChange?: (forceEnabled: boolean | null) => void;
  getMobileControlsForceState?: () => boolean | null;
  getDevicePlatform?: () => DevicePlatform;
  onCameraZoomChange?: (zoom: number) => void;
  getCameraZoom?: () => number;
  onWindowScaleModeChange?: (mode: WindowScaleMode) => void;
  getWindowScaleMode?: () => WindowScaleMode;
  onTestingModeChange?: (enabled: boolean) => void;
  getTestingMode?: () => boolean;
  onScreenChange?: (screen: MenuScreen) => void;
}

export interface MenuSystemOptions {
  container: HTMLElement;
  audioManager: IAudioManager;
  inputManager: IInputManager;
  peerManager?: IPeerManager;
  callbacks?: MenuCallbacks;
  initialUrlSearch?: string;
}

interface RebindTarget {
  group: 'p1' | 'p2' | 'common';
  action: string;
}

export class MenuSystem {
  private container: HTMLElement;
  private rootEl: HTMLElement;
  private audioManager: IAudioManager;
  private inputManager: IInputManager;
  private peerManager?: IPeerManager;
  private callbacks: MenuCallbacks;

  private currentScreen: MenuScreen = 'start';
  private selectedIndex = 0;
  private lobbyTab: 'host' | 'join' = 'host';
  private joinCodeInput = '';
  private roomCode: string | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private connectionError: string | null = null;
  private rttMs = 0;
  private copyFeedback = false;

  private lobbyConfig: LobbyConfig = createDefaultLobbyConfig();
  private rebindingTarget: RebindTarget | null = null;
  private rebindingButtonEl: HTMLButtonElement | null = null;

  private readonly boundKeyDown: (e: KeyboardEvent) => void;

  constructor(options: MenuSystemOptions) {
    this.container = options.container;
    this.audioManager = options.audioManager;
    this.inputManager = options.inputManager;
    this.peerManager = options.peerManager;
    this.callbacks = options.callbacks ?? {};

    this.rootEl = document.createElement('div');
    this.rootEl.className = 'shift-menu-overlay';
    this.container.appendChild(this.rootEl);

    if (this.peerManager) {
      this.peerManager.onStateChange((state, err) => {
        this.connectionState = state;
        this.connectionError = err ?? null;
        this.roomCode = this.peerManager?.getRoomCode() ?? this.roomCode;
        this.rttMs = this.peerManager?.getRttMs() ?? this.rttMs;
        if (state === 'connected' && this.lobbyTab === 'host') {
          this.broadcastLobbySync(false);
        }
        if (this.currentScreen === 'lobby') {
          this.render();
        }
      });

      this.peerManager.onPacket((packet: NetPacket) => {
        if (packet.type === 'lobbySync') {
          this.lobbyConfig = { ...packet.lobbyConfig };
          this.callbacks.onLobbyConfigChange?.(this.getLobbyConfig());
          if (packet.startGame && this.lobbyTab === 'join') {
            this.hide();
            this.callbacks.onStartOnlineGame?.(this.getLobbyConfig(), false);
            return;
          }
          if (this.currentScreen === 'lobby') {
            this.render();
          }
        }
      });
    }

    this.boundKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.boundKeyDown);
    }

    const search =
      options.initialUrlSearch !== undefined
        ? options.initialUrlSearch
        : typeof window !== 'undefined'
        ? window.location.search
        : '';
    const params = new URLSearchParams(search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl && roomFromUrl.trim().length > 0) {
      this.joinCodeInput = roomFromUrl.trim().toUpperCase();
      this.lobbyTab = 'join';
      this.lobbyConfig.mode = 'online';
      this.showScreen('lobby');
    } else {
      this.showScreen('start');
    }
  }

  public showScreen(screen: MenuScreen): void {
    this.rebindingTarget = null;
    this.currentScreen = screen;
    this.selectedIndex = 0;

    if (screen === 'hidden') {
      this.rootEl.classList.add('is-hidden');
      this.callbacks.onScreenChange?.(screen);
      return;
    }
    this.rootEl.classList.remove('is-hidden');

    if (screen === 'lobby') {
      this.lobbyConfig.mode = 'online';
      if (
        this.lobbyTab === 'host' &&
        this.peerManager &&
        this.connectionState === 'disconnected'
      ) {
        void this.peerManager.hostRoom().then((code) => {
          this.roomCode = code;
          if (this.currentScreen === 'lobby') {
            this.render();
          }
        });
      } else if (
        this.lobbyTab === 'join' &&
        this.peerManager &&
        this.connectionState === 'disconnected' &&
        this.joinCodeInput.trim().length >= 3
      ) {
        void this.peerManager.joinRoom(this.joinCodeInput.trim());
      }
    } else if (screen === 'tutorial') {
      this.lobbyConfig.mode = 'local';
    } else if (screen === 'gameOver' || screen === 'victory') {
      this.audioManager.stopAll();
    }

    this.render();
    this.callbacks.onScreenChange?.(screen);
  }

  public hide(): void {
    this.showScreen('hidden');
  }

  public getCurrentScreen(): MenuScreen {
    return this.currentScreen;
  }

  public isVisible(): boolean {
    return this.currentScreen !== 'hidden';
  }

  public getLobbyConfig(): LobbyConfig {
    return { ...this.lobbyConfig };
  }

  public setLobbyConfig(config: Partial<LobbyConfig>): void {
    this.lobbyConfig = { ...this.lobbyConfig, ...config };
    this.callbacks.onLobbyConfigChange?.(this.getLobbyConfig());
    if (this.currentScreen !== 'hidden') {
      this.render();
    }
  }

  public updateLobbyState(state: {
    connectionState?: ConnectionState;
    roomCode?: string | null;
    rttMs?: number;
    error?: string;
    isHost?: boolean;
  }): void {
    if (state.connectionState !== undefined) {
      this.connectionState = state.connectionState;
    }
    if (state.roomCode !== undefined) {
      this.roomCode = state.roomCode;
    }
    if (state.rttMs !== undefined) {
      this.rttMs = state.rttMs;
    }
    if (state.error !== undefined) {
      this.connectionError = state.error;
    }
    if (state.isHost !== undefined) {
      this.lobbyTab = state.isHost ? 'host' : 'join';
    }
    if (this.currentScreen === 'lobby') {
      this.render();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.currentScreen === 'hidden') {
      return;
    }

    // Handle active key rebinding capture first
    if (this.rebindingTarget) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        this.rebindingTarget = null;
        this.rebindingButtonEl = null;
        this.audioManager.playSound('menuCycle');
        this.render();
        return;
      }
      if (e.code) {
        const { group, action } = this.rebindingTarget;
        this.inputManager.updateBinding(group, action, e.code);
        if (this.rebindingButtonEl) {
          this.rebindingButtonEl.classList.remove('is-rebinding');
          const spans = this.rebindingButtonEl.querySelectorAll('span');
          if (spans[1]) {
            spans[1].textContent = this.inputManager.formatKeyLabel(e.code);
          }
        }
        this.rebindingTarget = null;
        this.rebindingButtonEl = null;
        this.audioManager.playSound('menuSelect');
        this.render();
      }
      return;
    }

    if (this.currentScreen === 'start') {
      const itemsCount = 4;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex - 1 + itemsCount) % itemsCount;
        this.audioManager.playSound('menuCycle');
        this.render();
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % itemsCount;
        this.audioManager.playSound('menuCycle');
        this.render();
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.audioManager.playSound('menuSelect');
        this.activateStartMenuItem(this.selectedIndex);
      }
      return;
    }

    if (this.currentScreen === 'tutorial') {
      if (
        e.key === 'Shift' ||
        e.key === 'Control' ||
        e.key === 'Alt' ||
        e.key === 'Meta' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight' ||
        e.code === 'ControlLeft' ||
        e.code === 'ControlRight' ||
        e.code === 'AltLeft' ||
        e.code === 'AltRight' ||
        e.code === 'MetaLeft' ||
        e.code === 'MetaRight'
      ) {
        return;
      }
      if (e.code === 'Escape' || e.key === 'Escape') {
        e.preventDefault();
        this.audioManager.playSound('menuSelect');
        this.showScreen('start');
        return;
      }
      e.preventDefault();
      this.audioManager.playSound('menuSelect');
      this.startLocalGameFromTutorial();
      return;
    }

    if (this.currentScreen === 'credits') {
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.audioManager.playSound('menuSelect');
        this.showScreen('start');
      }
      return;
    }

    if (
      this.currentScreen === 'options' ||
      this.currentScreen === 'controls' ||
      this.currentScreen === 'sound'
    ) {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.audioManager.playSound('menuSelect');
        this.showScreen('start');
      }
      return;
    }

    if (this.currentScreen === 'lobby') {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.peerManager?.disconnect();
        this.audioManager.playSound('menuSelect');
        this.showScreen('start');
      }
      return;
    }

    if (this.currentScreen === 'gameOver' || this.currentScreen === 'victory') {
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.audioManager.playSound('menuSelect');
        if (this.callbacks.onReturnToTitle) {
          this.callbacks.onReturnToTitle();
        } else {
          this.showScreen('start');
        }
      }
    }
  }

  private activateStartMenuItem(index: number): void {
    switch (index) {
      case 0:
        this.showScreen('tutorial');
        break;
      case 1:
        this.showScreen('lobby');
        break;
      case 2:
        this.showScreen('options');
        break;
      case 3:
        this.showScreen('credits');
        break;
    }
  }

  private startLocalGameFromTutorial(): void {
    this.lobbyConfig.mode = 'local';
    this.hide();
    this.callbacks.onStartLocalGame?.(this.getLobbyConfig());
  }

  private broadcastLobbySync(startGame: boolean = false): void {
    if (!this.peerManager || this.lobbyTab !== 'host') return;
    this.peerManager.sendPacket({
      type: 'lobbySync',
      lobbyConfig: this.getLobbyConfig(),
      hostReady: true,
      clientReady: this.connectionState === 'connected',
      startGame,
    });
  }

  private render(): void {
    this.rootEl.innerHTML = '';

    switch (this.currentScreen) {
      case 'start':
        this.renderStartScreen();
        break;
      case 'lobby':
        this.renderLobbyScreen();
        break;
      case 'options':
      case 'controls':
      case 'sound':
        this.renderOptionsScreen();
        break;
      case 'tutorial':
        this.renderTutorialScreen();
        break;
      case 'credits':
        this.renderCreditsScreen();
        break;
      case 'gameOver':
        this.renderBannerScreen('gameOver');
        break;
      case 'victory':
        this.renderBannerScreen('victory');
        break;
      case 'hidden':
        break;
    }
  }

  private renderStartScreen(): void {
    const logo = document.createElement('div');
    logo.className = 'shift-main-logo';
    logo.setAttribute('role', 'img');
    logo.setAttribute('aria-label', 'Shift: The Game');
    this.rootEl.appendChild(logo);

    const outerFrame = document.createElement('div');
    outerFrame.className = 'menu-outer-frame';

    const innerFrame = document.createElement('div');
    innerFrame.className = 'menu-inner-frame';

    const labels = ['LOCAL CO-OP', 'ONLINE CO-OP', 'OPTIONS', 'CREDITS'];

    labels.forEach((label, idx) => {
      const row = document.createElement('div');
      row.className = `menu-item-row${
        this.selectedIndex === idx ? ' is-selected' : ''
      }`;

      const leftInd = document.createElement('img');
      leftInd.src = '/images/indicator2.png';
      leftInd.alt = '';
      leftInd.className = 'menu-indicator indicator-left';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menu-btn';
      btn.textContent = label;
      btn.setAttribute(
        'data-testid',
        `start-btn-${label.toLowerCase().replace(/\s+/g, '-')}`
      );

      btn.addEventListener('mouseenter', () => {
        if (this.selectedIndex !== idx) {
          this.selectedIndex = idx;
          this.audioManager.playSound('menuCycle');
          this.render();
        }
      });

      btn.addEventListener('click', () => {
        this.selectedIndex = idx;
        this.audioManager.playSound('menuSelect');
        this.activateStartMenuItem(idx);
      });

      const rightInd = document.createElement('img');
      rightInd.src = '/images/indicator2.png';
      rightInd.alt = '';
      rightInd.className = 'menu-indicator indicator-right';

      row.appendChild(leftInd);
      row.appendChild(btn);
      row.appendChild(rightInd);
      innerFrame.appendChild(row);
    });

    outerFrame.appendChild(innerFrame);
    this.rootEl.appendChild(outerFrame);
  }

  private renderLobbyScreen(): void {
    const header = document.createElement('h1');
    header.className = 'menu-header-large';
    header.textContent = '- ONLINE CO-OP LOBBY -';
    this.rootEl.appendChild(header);

    const panel = document.createElement('div');
    panel.className = 'menu-panel';

    // Host / Join Tabs
    const tabs = document.createElement('div');
    tabs.className = 'menu-tabs';

    const hostTabBtn = document.createElement('button');
    hostTabBtn.type = 'button';
    hostTabBtn.className = `menu-tab-btn${
      this.lobbyTab === 'host' ? ' is-active' : ''
    }`;
    hostTabBtn.setAttribute('data-testid', 'lobby-tab-host');
    hostTabBtn.textContent = 'HOST ROOM';
    hostTabBtn.addEventListener('click', () => {
      this.audioManager.playSound('menuSelect');
      if (this.lobbyTab !== 'host') {
        this.peerManager?.disconnect();
      }
      this.lobbyTab = 'host';
      if (this.peerManager) {
        void this.peerManager.hostRoom().then((code) => {
          this.roomCode = code;
          this.render();
        });
      }
      this.render();
    });

    const joinTabBtn = document.createElement('button');
    joinTabBtn.type = 'button';
    joinTabBtn.className = `menu-tab-btn${
      this.lobbyTab === 'join' ? ' is-active' : ''
    }`;
    joinTabBtn.setAttribute('data-testid', 'lobby-tab-join');
    joinTabBtn.textContent = 'JOIN ROOM';
    joinTabBtn.addEventListener('click', () => {
      this.audioManager.playSound('menuSelect');
      if (this.lobbyTab !== 'join') {
        this.peerManager?.disconnect();
        this.roomCode = null;
      }
      this.lobbyTab = 'join';
      this.render();
    });

    tabs.appendChild(hostTabBtn);
    tabs.appendChild(joinTabBtn);
    panel.appendChild(tabs);

    const grid = document.createElement('div');
    grid.className = 'lobby-grid';

    // Left column: Connection & Room Code
    const connBox = document.createElement('div');
    connBox.className = 'lobby-box';

    if (this.lobbyTab === 'host') {
      const codeTitle = document.createElement('div');
      codeTitle.className = 'menu-header-small';
      codeTitle.textContent = 'Room Code';
      connBox.appendChild(codeTitle);

      const codeBadge = document.createElement('div');
      codeBadge.className = 'room-code-badge';
      codeBadge.setAttribute('data-testid', 'lobby-room-code');
      const displayCode =
        this.roomCode ?? this.peerManager?.getRoomCode() ?? 'GENERATING...';
      codeBadge.textContent = displayCode;
      connBox.appendChild(codeBadge);

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'action-btn';
      copyBtn.setAttribute('data-testid', 'copy-invite-btn');
      copyBtn.textContent = this.copyFeedback
        ? 'COPIED!'
        : 'COPY INVITE LINK';
      copyBtn.addEventListener('click', () => {
        this.audioManager.playSound('menuSelect');
        const origin =
          typeof window !== 'undefined' ? window.location.origin : '';
        const pathname =
          typeof window !== 'undefined' ? window.location.pathname : '/';
        const inviteUrl = `${origin}${pathname}?room=${encodeURIComponent(
          displayCode
        )}`;
        if (
          typeof navigator !== 'undefined' &&
          navigator.clipboard?.writeText
        ) {
          void navigator.clipboard.writeText(inviteUrl);
        }
        this.copyFeedback = true;
        this.render();
      });
      connBox.appendChild(copyBtn);
    } else {
      const joinTitle = document.createElement('label');
      joinTitle.className = 'menu-header-small';
      joinTitle.textContent = 'Enter Partner Room Code';
      connBox.appendChild(joinTitle);

      const inputRow = document.createElement('div');
      inputRow.style.display = 'flex';
      inputRow.style.gap = '10px';
      inputRow.style.alignItems = 'center';

      const codeInput = document.createElement('input');
      codeInput.type = 'text';
      codeInput.className = 'lobby-input';
      codeInput.setAttribute('data-testid', 'join-room-input');
      codeInput.placeholder = 'AB12C';
      codeInput.maxLength = 12;
      codeInput.value = this.joinCodeInput;
      codeInput.addEventListener('input', () => {
        this.joinCodeInput = codeInput.value.toUpperCase();
      });

      const connectBtn = document.createElement('button');
      connectBtn.type = 'button';
      connectBtn.className = 'action-btn';
      connectBtn.setAttribute('data-testid', 'join-connect-btn');
      connectBtn.textContent = 'JOIN ROOM';
      connectBtn.addEventListener('click', () => {
        this.audioManager.playSound('menuSelect');
        if (this.joinCodeInput.trim() && this.peerManager) {
          void this.peerManager.joinRoom(this.joinCodeInput.trim());
        }
      });

      inputRow.appendChild(codeInput);
      inputRow.appendChild(connectBtn);
      connBox.appendChild(inputRow);
    }

    const statusLine = document.createElement('div');
    statusLine.setAttribute('data-testid', 'lobby-connection-status');
    const rttVal = this.peerManager?.getRttMs() ?? this.rttMs;
    statusLine.textContent = `Status: ${this.connectionState.toUpperCase()}${
      this.connectionState === 'connected' ? ` (${rttVal} ms)` : ''
    }`;
    connBox.appendChild(statusLine);

    if (this.connectionError) {
      const errEl = document.createElement('div');
      errEl.style.color = '#ff4d4f';
      errEl.textContent = this.connectionError;
      connBox.appendChild(errEl);
    }

    grid.appendChild(connBox);

    // Right column: Host Settings Toggles
    const settingsBox = document.createElement('div');
    settingsBox.className = 'lobby-box';

    const settingsTitle = document.createElement('div');
    settingsTitle.className = 'menu-header-small';
    settingsTitle.textContent = 'Dimension Rules (Host Settings)';
    settingsBox.appendChild(settingsTitle);

    // 1. Shift Mode Toggle
    const shiftRow = document.createElement('div');
    shiftRow.className = 'setting-row';
    const shiftLabel = document.createElement('span');
    shiftLabel.textContent = 'Shift Mode:';
    const shiftBtn = document.createElement('button');
    shiftBtn.type = 'button';
    shiftBtn.className = 'action-btn';
    shiftBtn.setAttribute('data-testid', 'toggle-shift-mode');
    shiftBtn.disabled = this.lobbyTab !== 'host';
    shiftBtn.textContent =
      this.lobbyConfig.shiftMode === 'cooperative'
        ? 'Cooperative (Default)'
        : 'Individual (Cooldown)';
    shiftBtn.addEventListener('click', () => {
      this.audioManager.playSound('menuSelect');
      this.lobbyConfig.shiftMode =
        this.lobbyConfig.shiftMode === 'cooperative'
          ? 'individual'
          : 'cooperative';
      this.callbacks.onLobbyConfigChange?.(this.getLobbyConfig());
      this.broadcastLobbySync(false);
      this.render();
    });
    shiftRow.appendChild(shiftLabel);
    shiftRow.appendChild(shiftBtn);
    settingsBox.appendChild(shiftRow);

    // 2. Partner Visibility Toggle
    const visRow = document.createElement('div');
    visRow.className = 'setting-row';
    const visLabel = document.createElement('span');
    visLabel.textContent = 'Partner Visibility:';
    const visBtn = document.createElement('button');
    visBtn.type = 'button';
    visBtn.className = 'action-btn';
    visBtn.setAttribute('data-testid', 'toggle-partner-visibility');
    visBtn.disabled = this.lobbyTab !== 'host';
    visBtn.textContent =
      this.lobbyConfig.partnerVisibility === 'strict'
        ? 'Strict Blind (Default)'
        : 'Faint Partner Echo';
    visBtn.addEventListener('click', () => {
      this.audioManager.playSound('menuSelect');
      this.lobbyConfig.partnerVisibility =
        this.lobbyConfig.partnerVisibility === 'strict' ? 'echo' : 'strict';
      this.callbacks.onLobbyConfigChange?.(this.getLobbyConfig());
      this.broadcastLobbySync(false);
      this.render();
    });
    visRow.appendChild(visLabel);
    visRow.appendChild(visBtn);
    settingsBox.appendChild(visRow);

    // 3. Multiplayer Testing Mode Toggle (No Darkness + Blobby/Tear HP)
    const lobbyTestingRow = document.createElement('div');
    lobbyTestingRow.className = 'setting-row';
    const lobbyTestingLabel = document.createElement('span');
    lobbyTestingLabel.textContent = 'Testing Mode:';
    const lobbyTestingBtn = document.createElement('button');
    lobbyTestingBtn.type = 'button';
    lobbyTestingBtn.className = 'action-btn';
    lobbyTestingBtn.setAttribute('data-testid', 'toggle-testing-mode');
    lobbyTestingBtn.disabled = this.lobbyTab !== 'host';
    const isLobbyTestingOn = Boolean(
      this.callbacks.getTestingMode?.() ?? this.lobbyConfig.testingMode
    );
    this.lobbyConfig.testingMode = isLobbyTestingOn;
    lobbyTestingBtn.textContent = isLobbyTestingOn
      ? 'On (No Darkness + HP)'
      : 'Off';
    lobbyTestingBtn.addEventListener('click', () => {
      this.audioManager.playSound('menuSelect');
      const nextTesting = !Boolean(
        this.callbacks.getTestingMode?.() ?? this.lobbyConfig.testingMode
      );
      this.lobbyConfig.testingMode = nextTesting;
      this.callbacks.onTestingModeChange?.(nextTesting);
      this.callbacks.onLobbyConfigChange?.(this.getLobbyConfig());
      this.broadcastLobbySync(false);
      this.render();
    });
    lobbyTestingRow.appendChild(lobbyTestingLabel);
    lobbyTestingRow.appendChild(lobbyTestingBtn);
    settingsBox.appendChild(lobbyTestingRow);

    grid.appendChild(settingsBox);
    panel.appendChild(grid);
    this.rootEl.appendChild(panel);

    // Footer: Start Online Game & Back
    const footer = document.createElement('div');
    footer.className = 'menu-footer';

    if (this.lobbyTab === 'host') {
      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.className = 'action-btn';
      startBtn.setAttribute('data-testid', 'start-online-btn');
      startBtn.textContent = 'START ONLINE GAME';
      startBtn.disabled = this.connectionState !== 'connected';
      startBtn.addEventListener('click', () => {
        if (this.connectionState !== 'connected') return;
        this.audioManager.playSound('menuSelect');
        this.lobbyConfig.mode = 'online';
        this.broadcastLobbySync(true);
        this.hide();
        this.callbacks.onStartOnlineGame?.(this.getLobbyConfig(), true);
      });
      footer.appendChild(startBtn);
    }

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'action-btn';
    backBtn.setAttribute('data-testid', 'lobby-back-btn');
    backBtn.textContent = 'BACK';
    backBtn.addEventListener('click', () => {
      this.peerManager?.disconnect();
      this.audioManager.playSound('menuSelect');
      this.showScreen('start');
    });
    footer.appendChild(backBtn);

    this.rootEl.appendChild(footer);
  }

  private renderOptionsScreen(): void {
    const header = document.createElement('h1');
    header.className = 'menu-header-large';
    header.textContent = '- OPTIONS -';
    this.rootEl.appendChild(header);

    const panel = document.createElement('div');
    panel.className = 'menu-panel';

    // Top row: Sound Sliders + Local Shift Mode
    const topGrid = document.createElement('div');
    topGrid.className = 'lobby-grid';

    const volumeBox = document.createElement('div');
    volumeBox.className = 'lobby-box';
    const volTitle = document.createElement('div');
    volTitle.className = 'menu-header-small';
    volTitle.textContent = '- VOLUME -';
    volumeBox.appendChild(volTitle);

    // Effects Slider
    const sfxRow = document.createElement('div');
    sfxRow.className = 'slider-row';
    const sfxLabel = document.createElement('label');
    sfxLabel.htmlFor = 'slider-sfx-input';
    sfxLabel.textContent = 'Effects';
    const sfxInput = document.createElement('input');
    sfxInput.id = 'slider-sfx-input';
    sfxInput.type = 'range';
    sfxInput.className = 'retro-slider';
    sfxInput.setAttribute('data-testid', 'slider-sfx');
    sfxInput.min = '0';
    sfxInput.max = '1';
    sfxInput.step = '0.01';
    sfxInput.value = String(this.audioManager.getSFXVolume());
    const onSfxChange = () => {
      const val = parseFloat(sfxInput.value);
      this.audioManager.setSFXVolume(val);
      this.audioManager.playSound('shift');
    };
    sfxInput.addEventListener('input', onSfxChange);
    sfxInput.addEventListener('change', onSfxChange);
    sfxRow.appendChild(sfxLabel);
    sfxRow.appendChild(sfxInput);
    volumeBox.appendChild(sfxRow);

    // Music Slider
    const musicRow = document.createElement('div');
    musicRow.className = 'slider-row';
    const musicLabel = document.createElement('label');
    musicLabel.htmlFor = 'slider-music-input';
    musicLabel.textContent = 'Music';
    const musicInput = document.createElement('input');
    musicInput.id = 'slider-music-input';
    musicInput.type = 'range';
    musicInput.className = 'retro-slider';
    musicInput.setAttribute('data-testid', 'slider-music');
    musicInput.min = '0';
    musicInput.max = '1';
    musicInput.step = '0.01';
    musicInput.value = String(this.audioManager.getMusicVolume());
    const onMusicChange = () => {
      const val = parseFloat(musicInput.value);
      this.audioManager.setMusicVolume(val);
      const maybeTest = this.audioManager as IAudioManager & {
        playMusicVolumeTest?: (name?: string) => void;
      };
      maybeTest.playMusicVolumeTest?.('ambience2');
    };
    musicInput.addEventListener('input', onMusicChange);
    musicInput.addEventListener('change', onMusicChange);
    musicRow.appendChild(musicLabel);
    musicRow.appendChild(musicInput);
    volumeBox.appendChild(musicRow);

    topGrid.appendChild(volumeBox);

    // Gameplay / Display Settings Box
    const modeBox = document.createElement('div');
    modeBox.className = 'lobby-box';
    const modeTitle = document.createElement('div');
    modeTitle.className = 'menu-header-small';
    modeTitle.textContent = '- GAMEPLAY & DISPLAY -';
    modeBox.appendChild(modeTitle);

    const localShiftRow = document.createElement('div');
    localShiftRow.className = 'setting-row';
    const localShiftLabel = document.createElement('span');
    localShiftLabel.textContent = 'Local Shift Mode:';
    const localShiftBtn = document.createElement('button');
    localShiftBtn.type = 'button';
    localShiftBtn.className = 'action-btn';
    localShiftBtn.setAttribute('data-testid', 'options-shift-mode');
    localShiftBtn.textContent =
      this.lobbyConfig.shiftMode === 'cooperative'
        ? 'Cooperative'
        : 'Individual';
    localShiftBtn.addEventListener('click', () => {
      this.audioManager.playSound('menuSelect');
      this.lobbyConfig.shiftMode =
        this.lobbyConfig.shiftMode === 'cooperative'
          ? 'individual'
          : 'cooperative';
      this.callbacks.onLobbyConfigChange?.(this.getLobbyConfig());
      this.render();
    });
    localShiftRow.appendChild(localShiftLabel);
    localShiftRow.appendChild(localShiftBtn);
    modeBox.appendChild(localShiftRow);

    const testingRow = document.createElement('div');
    testingRow.className = 'setting-row';
    const testingLabel = document.createElement('span');
    testingLabel.textContent = 'Testing Mode:';
    const testingBtn = document.createElement('button');
    testingBtn.type = 'button';
    testingBtn.className = 'action-btn';
    testingBtn.setAttribute('data-testid', 'options-testing-mode');
    const isTestingOn = Boolean(
      this.callbacks.getTestingMode?.() ?? this.lobbyConfig.testingMode
    );
    this.lobbyConfig.testingMode = isTestingOn;
    testingBtn.textContent = isTestingOn ? 'On' : 'Off';
    testingBtn.addEventListener('click', () => {
      this.audioManager.playSound('menuSelect');
      const nextTesting = !Boolean(
        this.callbacks.getTestingMode?.() ?? this.lobbyConfig.testingMode
      );
      this.lobbyConfig.testingMode = nextTesting;
      this.callbacks.onTestingModeChange?.(nextTesting);
      this.callbacks.onLobbyConfigChange?.(this.getLobbyConfig());
      this.render();
    });
    testingRow.appendChild(testingLabel);
    testingRow.appendChild(testingBtn);
    modeBox.appendChild(testingRow);

    const touchRow = document.createElement('div');
    touchRow.className = 'setting-row';
    const touchLabel = document.createElement('span');
    touchLabel.textContent = 'Touch Controls:';
    const touchBtn = document.createElement('button');
    touchBtn.type = 'button';
    touchBtn.className = 'action-btn';
    touchBtn.setAttribute('data-testid', 'options-touch-controls');
    const currentForce = this.callbacks.getMobileControlsForceState?.() ?? null;
    touchBtn.textContent =
      currentForce === null ? 'Auto' : currentForce ? 'On' : 'Off';
    touchBtn.addEventListener('click', () => {
      this.audioManager.playSound('menuSelect');
      const cur = this.callbacks.getMobileControlsForceState?.() ?? null;
      const next: boolean | null =
        cur === null ? true : cur === true ? false : null;
      this.callbacks.onMobileControlsChange?.(next);
      this.render();
    });
    touchRow.appendChild(touchLabel);
    touchRow.appendChild(touchBtn);
    modeBox.appendChild(touchRow);

    const scaleRow = document.createElement('div');
    scaleRow.className = 'setting-row';
    const scaleLabel = document.createElement('span');
    scaleLabel.textContent = 'Window Scale:';
    const scaleBtn = document.createElement('button');
    scaleBtn.type = 'button';
    scaleBtn.className = 'action-btn';
    scaleBtn.setAttribute('data-testid', 'options-window-scale');
    const currentScaleMode =
      this.callbacks.getWindowScaleMode?.() ?? DEFAULT_WINDOW_SCALE_MODE;
    const formatScaleLabel = (mode: WindowScaleMode): string => {
      switch (mode) {
        case 'fit':
          return 'Fit (Integer)';
        case 'integer':
          return 'Integer (1x/2x/3x)';
        case 'stretch':
          return 'Stretch';
        case 'native':
          return 'Original (1x)';
      }
    };
    scaleBtn.textContent = formatScaleLabel(currentScaleMode);
    scaleBtn.addEventListener('click', () => {
      this.audioManager.playSound('menuSelect');
      const cur =
        this.callbacks.getWindowScaleMode?.() ?? DEFAULT_WINDOW_SCALE_MODE;
      const idx = WINDOW_SCALE_MODES.indexOf(cur);
      const next =
        WINDOW_SCALE_MODES[(idx + 1) % WINDOW_SCALE_MODES.length] ??
        DEFAULT_WINDOW_SCALE_MODE;
      this.callbacks.onWindowScaleModeChange?.(next);
      this.render();
    });
    scaleRow.appendChild(scaleLabel);
    scaleRow.appendChild(scaleBtn);
    modeBox.appendChild(scaleRow);

    const zoomRow = document.createElement('div');
    zoomRow.className = 'slider-row';
    const currentZoom = this.callbacks.getCameraZoom?.() ?? 1.0;
    const zoomLabel = document.createElement('label');
    zoomLabel.htmlFor = 'slider-zoom-input';
    zoomLabel.textContent = `Zoom (${Number(currentZoom.toFixed(2))}x)`;
    const zoomInput = document.createElement('input');
    zoomInput.id = 'slider-zoom-input';
    zoomInput.type = 'range';
    zoomInput.className = 'retro-slider';
    zoomInput.setAttribute('data-testid', 'slider-zoom');
    zoomInput.min = '1';
    zoomInput.max = '4';
    zoomInput.step = '0.05';
    zoomInput.value = String(currentZoom);
    const onZoomSliderChange = () => {
      const val = parseFloat(zoomInput.value);
      if (Number.isFinite(val)) {
        this.callbacks.onCameraZoomChange?.(val);
        zoomLabel.textContent = `Zoom (${Number(val.toFixed(2))}x)`;
      }
    };
    zoomInput.addEventListener('input', onZoomSliderChange);
    zoomInput.addEventListener('change', onZoomSliderChange);
    zoomRow.appendChild(zoomLabel);
    zoomRow.appendChild(zoomInput);
    modeBox.appendChild(zoomRow);

    topGrid.appendChild(modeBox);
    panel.appendChild(topGrid);

    // Controls Rebinding Section
    const controlsSection = document.createElement('div');
    const controlsTitle = document.createElement('div');
    controlsTitle.className = 'menu-header-small';
    controlsTitle.textContent = '- CONTROLS (Click any key to rebind, ESC to cancel) -';
    controlsSection.appendChild(controlsTitle);

    const cols = document.createElement('div');
    cols.className = 'controls-columns';

    const settings = this.inputManager.getSettings();

    const createGroupColumn = (
      title: string,
      group: 'p1' | 'p2' | 'common',
      bindings: PlayerKeyBindings | CommonKeyBindings
    ) => {
      const col = document.createElement('div');
      col.className = 'controls-group';
      const h = document.createElement('div');
      h.className = 'menu-header-small';
      h.textContent = title;
      col.appendChild(h);

      for (const [action, code] of Object.entries(bindings)) {
        const isRebinding =
          this.rebindingTarget?.group === group &&
          this.rebindingTarget?.action === action;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `binding-btn${isRebinding ? ' is-rebinding' : ''}`;
        btn.setAttribute('data-binding', `${group}.${action}`);

        const actionSpan = document.createElement('span');
        actionSpan.textContent = `${action}:`;
        const keySpan = document.createElement('span');
        keySpan.textContent = isRebinding
          ? '[PRESS KEY]'
          : this.inputManager.formatKeyLabel(code as string);

        btn.appendChild(actionSpan);
        btn.appendChild(keySpan);

        btn.addEventListener('click', () => {
          this.audioManager.playSound('menuSelect');
          this.rebindingTarget = { group, action };
          this.rebindingButtonEl = btn;
          btn.classList.add('is-rebinding');
          keySpan.textContent = '[PRESS KEY]';
          this.render();
        });

        col.appendChild(btn);
      }

      return col;
    };

    cols.appendChild(createGroupColumn('Left Player', 'p1', settings.p1));
    cols.appendChild(createGroupColumn('Right Player', 'p2', settings.p2));
    cols.appendChild(createGroupColumn('Common', 'common', settings.common));

    controlsSection.appendChild(cols);
    panel.appendChild(controlsSection);
    this.rootEl.appendChild(panel);

    const footer = document.createElement('div');
    footer.className = 'menu-footer';
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'action-btn';
    backBtn.setAttribute('data-testid', 'options-back-btn');
    backBtn.textContent = 'BACK';
    backBtn.addEventListener('click', () => {
      this.audioManager.playSound('menuSelect');
      this.showScreen('start');
    });
    footer.appendChild(backBtn);
    this.rootEl.appendChild(footer);
  }

  private renderTutorialScreen(): void {
    const settings = this.inputManager.getSettings();
    const fmt = (c: string) => this.inputManager.formatKeyLabel(c);

    const card = document.createElement('div');
    card.className = 'tutorial-card';

    const title = document.createElement('h2');
    title.className = 'menu-header-medium';
    title.textContent = '- SURVIVAL INSTRUCTIONS -';
    card.appendChild(title);

    const p1Move = `${fmt(settings.p1.Up)}/${fmt(settings.p1.Left)}/${fmt(
      settings.p1.Down
    )}/${fmt(settings.p1.Right)}`;
    const p2Move = `${fmt(settings.p2.Up)}/${fmt(settings.p2.Left)}/${fmt(
      settings.p2.Down
    )}/${fmt(settings.p2.Right)}`;

    const body1 = document.createElement('p');
    body1.textContent = `This is a two-player co-op survival game across two parallel dimensions. Move with ${p1Move} (Left Player) and ${p2Move} (Right Player).`;
    card.appendChild(body1);

    const body2 = document.createElement('p');
    body2.textContent = `Press "${fmt(settings.p1.Interact)}" / "${fmt(
      settings.p2.Interact
    )}" to Interact, "${fmt(settings.p1.UseItem)}" / "${fmt(
      settings.p2.UseItem
    )}" to Use Held Item, and "${fmt(settings.p1.Inventory)}" / "${fmt(
      settings.p2.Inventory
    )}" to Cycle Inventory (Hold 1s to Drop Item). Press "${fmt(
      settings.common.SwitchDimensions
    )}" to Shift Dimensions and "${fmt(settings.p1.Ping)}" / "${fmt(
      settings.p2.Ping
    )}" to Ping your partner.`;
    card.appendChild(body2);

    const platform = this.callbacks.getDevicePlatform?.() ?? 'pc';
    if (platform === 'mobile') {
      const mobileNote = document.createElement('p');
      mobileNote.textContent =
        'Mobile Local Co-op: Hold opposite ends of the phone long ways — Left thumb controls movement, Right thumb controls actions and shifting.';
      card.appendChild(mobileNote);
    } else {
      const pcNote = document.createElement('p');
      pcNote.textContent =
        'PC Local Co-op: Side-by-side split screen — Left Player and Right Player share the keyboard.';
      card.appendChild(pcNote);
    }

    const warning = document.createElement('p');
    warning.innerHTML =
      '<em>Read all the books</em> before leaving the spawn room if you want to live...';
    card.appendChild(warning);

    const prompt = document.createElement('div');
    prompt.className = 'tutorial-prompt';
    prompt.textContent = 'Press any key to enter the mansion... (or tap)';
    card.appendChild(prompt);

    card.addEventListener('click', () => {
      this.audioManager.playSound('menuSelect');
      this.startLocalGameFromTutorial();
    });

    this.rootEl.appendChild(card);
  }

  private renderCreditsScreen(): void {
    const img = document.createElement('img');
    img.src = '/images/credits.png';
    img.alt = 'Shift: The Game Credits';
    img.className = 'credits-img';
    this.rootEl.appendChild(img);

    const footer = document.createElement('div');
    footer.className = 'menu-footer';
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'action-btn';
    backBtn.setAttribute('data-testid', 'credits-back-btn');
    backBtn.textContent = 'BACK';
    backBtn.addEventListener('click', () => {
      this.audioManager.playSound('menuSelect');
      this.showScreen('start');
    });
    footer.appendChild(backBtn);
    this.rootEl.appendChild(footer);
  }

  private renderBannerScreen(kind: 'gameOver' | 'victory'): void {
    const banner = document.createElement('div');
    banner.className = 'sprite-banner-fullscreen';
    banner.setAttribute(
      'data-testid',
      kind === 'gameOver' ? 'banner-game-over' : 'banner-victory'
    );
    // I_gameOver: [350, 0, 1000, 650], I_theEnd: [350, 650, 1000, 650]
    banner.style.backgroundPosition =
      kind === 'gameOver' ? '-350px 0px' : '-350px -650px';

    const prompt = document.createElement('div');
    prompt.className = 'banner-prompt';
    prompt.textContent =
      'Press ENTER, SPACE, or ESC to return to Start Screen (or tap)';
    banner.appendChild(prompt);

    banner.addEventListener('click', () => {
      this.audioManager.playSound('menuSelect');
      if (this.callbacks.onReturnToTitle) {
        this.callbacks.onReturnToTitle();
      } else {
        this.showScreen('start');
      }
    });

    this.rootEl.appendChild(banner);
  }

  public destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
    }
    this.rootEl.remove();
  }
}
