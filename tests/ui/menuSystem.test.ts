// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MenuSystem } from '../../src/ui/menuSystem';
import { AudioManager } from '../../src/audio/audioManager';
import { InputManager } from '../../src/input/inputManager';
import { ConnectionState, IPeerManager, NetPacket } from '../../src/shared/types';

function createMockPeerManager(): IPeerManager & {
  triggerState: (state: ConnectionState, err?: string) => void;
  setRtt: (ms: number) => void;
} {
  let roomCode: string | null = 'AB12C';
  let connState: ConnectionState = 'disconnected';
  let rtt = 24;
  const stateHandlers: Array<(state: ConnectionState, error?: string) => void> = [];
  const packetHandlers: Array<(packet: NetPacket) => void> = [];

  return {
    hostRoom: vi.fn(async (custom?: string) => {
      roomCode = custom ?? 'AB12C';
      connState = 'hosting';
      stateHandlers.forEach((h) => h(connState));
      return roomCode;
    }),
    joinRoom: vi.fn(async (code: string) => {
      roomCode = code;
      connState = 'joining';
      stateHandlers.forEach((h) => h(connState));
    }),
    sendPacket: vi.fn(),
    onPacket: vi.fn((h) => packetHandlers.push(h)),
    onStateChange: vi.fn((h) => stateHandlers.push(h)),
    getRoomCode: () => roomCode,
    getConnectionState: () => connState,
    getRttMs: () => rtt,
    disconnect: vi.fn(() => {
      connState = 'disconnected';
    }),
    triggerState: (st: ConnectionState, err?: string) => {
      connState = st;
      stateHandlers.forEach((h) => h(st, err));
    },
    setRtt: (ms: number) => {
      rtt = ms;
    },
  };
}

describe('MenuSystem', () => {
  let container: HTMLElement;
  let audio: AudioManager;
  let input: InputManager;
  let peer: ReturnType<typeof createMockPeerManager>;
  let menu: MenuSystem;

  beforeEach(async () => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    audio = new AudioManager();
    await audio.init();
    input = new InputManager();
    peer = createMockPeerManager();
  });

  afterEach(() => {
    menu?.destroy();
    input?.destroy();
    container?.remove();
  });

  it('renders Start Screen with main logo, double-bordered frame, 4 menu buttons, and keyboard navigation', () => {
    menu = new MenuSystem({
      container,
      audioManager: audio,
      inputManager: input,
      peerManager: peer,
    });
    menu.showScreen('start');

    expect(menu.getCurrentScreen()).toBe('start');
    expect(container.textContent).toContain('LOCAL CO-OP');
    expect(container.textContent).toContain('ONLINE CO-OP');
    expect(container.textContent).toContain('OPTIONS');
    expect(container.textContent).toContain('CREDITS');

    const outerFrame = container.querySelector('.menu-outer-frame') as HTMLElement;
    const innerFrame = container.querySelector('.menu-inner-frame') as HTMLElement;
    expect(outerFrame).toBeTruthy();
    expect(innerFrame).toBeTruthy();

    // Keyboard Down/S cycles selection and Enter activates ONLINE CO-OP
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
    expect(menu.getCurrentScreen()).toBe('lobby');
  });

  it('auto-opens Online Lobby Join tab when ?room=XXXXX is in initialUrlSearch and supports Host settings toggles', async () => {
    const onStartOnline = vi.fn();
    menu = new MenuSystem({
      container,
      audioManager: audio,
      inputManager: input,
      peerManager: peer,
      initialUrlSearch: '?room=ZX99Q',
      callbacks: { onStartOnlineGame: onStartOnline },
    });

    expect(menu.getCurrentScreen()).toBe('lobby');
    const joinInput = container.querySelector('input[data-testid="join-room-input"]') as HTMLInputElement;
    expect(joinInput).toBeTruthy();
    expect(joinInput.value).toBe('ZX99Q');

    // Switch to Host tab
    const hostTabBtn = container.querySelector('[data-testid="lobby-tab-host"]') as HTMLButtonElement;
    hostTabBtn.click();

    expect(peer.hostRoom).toHaveBeenCalled();
    expect(container.textContent).toContain('AB12C');
    expect(container.textContent).toContain('COPY INVITE LINK');

    // Start button should be disabled before connection
    const startBtn = container.querySelector('[data-testid="start-online-btn"]') as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);

    // Toggle Shift Mode (Cooperative -> Individual) and Partner Visibility (Strict -> Echo)
    const shiftToggle = container.querySelector('[data-testid="toggle-shift-mode"]') as HTMLButtonElement;
    const visToggle = container.querySelector('[data-testid="toggle-partner-visibility"]') as HTMLButtonElement;
    shiftToggle.click();
    visToggle.click();

    expect(menu.getLobbyConfig().shiftMode).toBe('individual');
    expect(menu.getLobbyConfig().partnerVisibility).toBe('echo');

    // Simulate peer connection
    peer.setRtt(32);
    peer.triggerState('connected');

    const startBtnAfter = container.querySelector('[data-testid="start-online-btn"]') as HTMLButtonElement;
    expect(startBtnAfter.disabled).toBe(false);
    expect(container.textContent).toContain('32 ms');

    startBtnAfter.click();
    expect(onStartOnline).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'online',
        shiftMode: 'individual',
        partnerVisibility: 'echo',
      }),
      true
    );
  });

  it('renders Options Screen with Effects/Music sliders, Local Shift Mode toggle, and interactive Controls Rebinding with Escape cancel', () => {
    menu = new MenuSystem({
      container,
      audioManager: audio,
      inputManager: input,
      peerManager: peer,
    });
    menu.showScreen('options');

    const sfxSlider = container.querySelector('[data-testid="slider-sfx"]') as HTMLInputElement;
    const musicSlider = container.querySelector('[data-testid="slider-music"]') as HTMLInputElement;
    expect(sfxSlider).toBeTruthy();
    expect(musicSlider).toBeTruthy();

    sfxSlider.value = '0.35';
    sfxSlider.dispatchEvent(new Event('input', { bubbles: true }));
    sfxSlider.dispatchEvent(new Event('change', { bubbles: true }));
    expect(audio.getSFXVolume()).toBeCloseTo(0.35, 2);

    musicSlider.value = '0.85';
    musicSlider.dispatchEvent(new Event('input', { bubbles: true }));
    musicSlider.dispatchEvent(new Event('change', { bubbles: true }));
    expect(audio.getMusicVolume()).toBeCloseTo(0.85, 2);

    // Local Shift Mode toggle
    const localShiftBtn = container.querySelector('[data-testid="options-shift-mode"]') as HTMLButtonElement;
    expect(localShiftBtn).toBeTruthy();
    expect(menu.getLobbyConfig().shiftMode).toBe('cooperative');
    localShiftBtn.click();
    expect(menu.getLobbyConfig().shiftMode).toBe('individual');

    // Rebind P1 Interact key
    const p1InteractBtn = container.querySelector('[data-binding="p1.Interact"]') as HTMLButtonElement;
    expect(p1InteractBtn).toBeTruthy();
    p1InteractBtn.click();

    // Press Escape to cancel rebinding — should keep Digit1
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(input.getSettings().p1.Interact).toBe('Digit1');

    // Click again and bind to KeyF
    p1InteractBtn.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
    expect(input.getSettings().p1.Interact).toBe('KeyF');
    expect(p1InteractBtn.textContent).toContain('F');
  });

  it('renders Viewport Zoom slider in Options Screen and invokes onCameraZoomChange callback', () => {
    let currentZoom = 1.0;
    const onCameraZoomChange = vi.fn((z: number) => {
      currentZoom = z;
    });

    menu = new MenuSystem({
      container,
      audioManager: audio,
      inputManager: input,
      peerManager: peer,
      callbacks: {
        getCameraZoom: () => currentZoom,
        onCameraZoomChange,
      },
    });
    menu.showScreen('options');

    const zoomSlider = container.querySelector('[data-testid="slider-zoom"]') as HTMLInputElement;
    expect(zoomSlider).toBeTruthy();
    expect(zoomSlider.value).toBe('1');

    zoomSlider.value = '1.75';
    zoomSlider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onCameraZoomChange).toHaveBeenCalledWith(1.75);
    expect(container.textContent).toContain('1.75x');
  });

  it('renders Window Scale toggle in Options Screen and cycles through fit, integer, stretch, and native modes', () => {
    let currentScaleMode: 'fit' | 'integer' | 'stretch' | 'native' = 'fit';
    const onWindowScaleModeChange = vi.fn((mode) => {
      currentScaleMode = mode;
    });

    menu = new MenuSystem({
      container,
      audioManager: audio,
      inputManager: input,
      peerManager: peer,
      callbacks: {
        getWindowScaleMode: () => currentScaleMode,
        onWindowScaleModeChange,
      },
    });
    menu.showScreen('options');

    const scaleBtn = container.querySelector(
      '[data-testid="options-window-scale"]'
    ) as HTMLButtonElement;
    expect(scaleBtn).toBeTruthy();
    expect(scaleBtn.textContent).toBe('Fit (Integer)');

    scaleBtn.click();
    expect(onWindowScaleModeChange).toHaveBeenCalledWith('integer');
    expect(
      (container.querySelector('[data-testid="options-window-scale"]') as HTMLButtonElement)
        .textContent
    ).toBe('Integer (1x/2x/3x)');

    (
      container.querySelector('[data-testid="options-window-scale"]') as HTMLButtonElement
    ).click();
    expect(onWindowScaleModeChange).toHaveBeenCalledWith('stretch');
    expect(
      (container.querySelector('[data-testid="options-window-scale"]') as HTMLButtonElement)
        .textContent
    ).toBe('Stretch');

    (
      container.querySelector('[data-testid="options-window-scale"]') as HTMLButtonElement
    ).click();
    expect(onWindowScaleModeChange).toHaveBeenCalledWith('native');
    expect(
      (container.querySelector('[data-testid="options-window-scale"]') as HTMLButtonElement)
        .textContent
    ).toBe('Original (1x)');

    (
      container.querySelector('[data-testid="options-window-scale"]') as HTMLButtonElement
    ).click();
    expect(onWindowScaleModeChange).toHaveBeenCalledWith('fit');
  });

  it('renders Multiplayer Testing Mode toggle in Options and Online Lobby screens and syncs LobbyConfig', () => {
    let testingMode = false;
    const onTestingModeChange = vi.fn((enabled: boolean) => {
      testingMode = enabled;
    });
    const onLobbyConfigChange = vi.fn();

    menu = new MenuSystem({
      container,
      audioManager: audio,
      inputManager: input,
      peerManager: peer,
      callbacks: {
        getTestingMode: () => testingMode,
        onTestingModeChange,
        onLobbyConfigChange,
      },
    });
    menu.showScreen('options');

    const testingBtn = container.querySelector(
      '[data-testid="options-testing-mode"]'
    ) as HTMLButtonElement;
    expect(testingBtn).toBeTruthy();
    expect(testingBtn.textContent).toBe('Off');

    testingBtn.click();
    expect(onTestingModeChange).toHaveBeenCalledWith(true);
    expect(menu.getLobbyConfig().testingMode).toBe(true);
    expect(onLobbyConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ testingMode: true })
    );
    expect(
      (container.querySelector('[data-testid="options-testing-mode"]') as HTMLButtonElement)
        .textContent
    ).toBe('On');

    // Open Online Lobby -> Host can also toggle Testing Mode there
    menu.showScreen('lobby');
    const lobbyTestingBtn = container.querySelector(
      '[data-testid="toggle-testing-mode"]'
    ) as HTMLButtonElement;
    expect(lobbyTestingBtn).toBeTruthy();
    expect(lobbyTestingBtn.textContent).toContain('On');

    lobbyTestingBtn.click();
    expect(onTestingModeChange).toHaveBeenCalledWith(false);
    expect(menu.getLobbyConfig().testingMode).toBe(false);
  });

  it('renders Tutorial Screen with formatted keybindings from InputManager and starts game on key press', () => {
    const onStartLocal = vi.fn();
    input.updateBinding('p1', 'Interact', 'KeyG');

    menu = new MenuSystem({
      container,
      audioManager: audio,
      inputManager: input,
      callbacks: { onStartLocalGame: onStartLocal },
    });
    menu.showScreen('tutorial');

    expect(container.textContent).toContain('Press any key to enter the mansion...');
    expect(container.textContent).toContain('G');

    // Bare modifier keys (ShiftLeft) should NOT start the game
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift' }));
    expect(onStartLocal).not.toHaveBeenCalled();
    expect(menu.getCurrentScreen()).toBe('tutorial');

    // Escape on Tutorial should return to Start screen without starting the game
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
    expect(onStartLocal).not.toHaveBeenCalled();
    expect(menu.getCurrentScreen()).toBe('start');

    // Re-open tutorial and press Space -> starts local game
    menu.showScreen('tutorial');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    expect(onStartLocal).toHaveBeenCalled();
  });

  it('renders Credits, Game Over (I_gameOver), and Victory (I_theEnd) screens and returns to Start on Enter/Space/Escape', () => {
    menu = new MenuSystem({
      container,
      audioManager: audio,
      inputManager: input,
    });

    menu.showScreen('credits');
    expect(container.querySelector('img[src*="credits.png"]')).toBeTruthy();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(menu.getCurrentScreen()).toBe('start');

    menu.showScreen('gameOver');
    const gameOverBanner = container.querySelector('[data-testid="banner-game-over"]') as HTMLElement;
    expect(gameOverBanner).toBeTruthy();
    expect(gameOverBanner.style.backgroundPosition).toContain('-350px 0px');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
    expect(menu.getCurrentScreen()).toBe('start');

    menu.showScreen('victory');
    const victoryBanner = container.querySelector('[data-testid="banner-victory"]') as HTMLElement;
    expect(victoryBanner).toBeTruthy();
    expect(victoryBanner.style.backgroundPosition).toContain('-350px -650px');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(menu.getCurrentScreen()).toBe('start');
  });

  it('starts online game for Client when receiving lobbySync packet with startGame: true', () => {
    let capturedPacketHandler: ((packet: NetPacket) => void) | null = null;
    peer.onPacket = vi.fn((h) => {
      capturedPacketHandler = h;
    });

    const onStartOnline = vi.fn();
    menu = new MenuSystem({
      container,
      audioManager: audio,
      inputManager: input,
      peerManager: peer,
      initialUrlSearch: '?room=HOST1',
      callbacks: { onStartOnlineGame: onStartOnline },
    });

    expect(menu.getCurrentScreen()).toBe('lobby');
    expect(capturedPacketHandler).toBeTruthy();

    capturedPacketHandler!({
      type: 'lobbySync',
      lobbyConfig: {
        mode: 'online',
        partnerVisibility: 'echo',
        shiftMode: 'individual',
        muffledCrossDimensionAudio: true,
      },
      hostReady: true,
      clientReady: true,
      startGame: true,
    });

    expect(onStartOnline).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'online',
        partnerVisibility: 'echo',
        shiftMode: 'individual',
      }),
      false
    );
    expect(menu.isVisible()).toBe(false);
  });

  it('auto-joins room from URL query string, broadcasts lobbySync when Client connects to Host, and disconnects when switching Lobby tabs', () => {
    let capturedStateHandler: ((state: any, error?: string) => void) | null = null;
    peer.onStateChange = vi.fn((h) => {
      capturedStateHandler = h;
    });

    menu = new MenuSystem({
      container,
      audioManager: audio,
      inputManager: input,
      peerManager: peer,
      initialUrlSearch: '?room=JOIN9',
    });

    // URL ?room=JOIN9 should automatically trigger peer.joinRoom('JOIN9')
    expect(peer.joinRoom).toHaveBeenCalledWith('JOIN9');

    // Switch to Host tab -> disconnects previous Join session and starts hosting
    const hostTabBtn = container.querySelector('[data-testid="lobby-tab-host"]') as HTMLButtonElement;
    hostTabBtn.click();
    expect(peer.disconnect).toHaveBeenCalled();
    expect(peer.hostRoom).toHaveBeenCalled();

    // Host configures settings while waiting for Client
    const visToggle = container.querySelector('[data-testid="toggle-partner-visibility"]') as HTMLButtonElement;
    visToggle.click();
    vi.mocked(peer.sendPacket).mockClear();

    // Client connects -> Host must immediately broadcast its current lobbyConfig via lobbySync!
    expect(capturedStateHandler).toBeTruthy();
    capturedStateHandler!('connected');
    expect(peer.sendPacket).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'lobbySync',
        lobbyConfig: expect.objectContaining({
          partnerVisibility: 'echo',
        }),
        startGame: false,
      })
    );
  });

  it('supports pasting full invite URLs into Join Room input on mobile, sets mobile keyboard attributes, and submits on Enter', () => {
    menu = new MenuSystem({
      container,
      audioManager: audio,
      inputManager: input,
      peerManager: peer,
    });
    menu.showScreen('lobby');

    const joinTabBtn = container.querySelector('[data-testid="lobby-tab-join"]') as HTMLButtonElement;
    joinTabBtn.click();

    const codeInput = container.querySelector('[data-testid="join-room-input"]') as HTMLInputElement;
    expect(codeInput).toBeTruthy();
    expect(codeInput.getAttribute('autocapitalize')).toBe('characters');
    expect(codeInput.getAttribute('autocorrect')).toBe('off');
    expect(codeInput.getAttribute('spellcheck')).toBe('false');
    expect(codeInput.maxLength).toBeGreaterThanOrEqual(128);

    // Pasting a full invite URL into the input extracts the 5-char room code instead of truncating "https://..."
    codeInput.value = 'https://shift-game-v2.web.app/?room=k7m9p';
    codeInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(codeInput.value).toBe('K7M9P');

    // Pressing Enter inside the input triggers joinRoom('K7M9P')
    codeInput.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true })
    );
    expect(peer.joinRoom).toHaveBeenCalledWith('K7M9P');
  });

  it('supports navigating menus, starting the game, rebinding controls, and toggling Single Controller target with a Gamepad', () => {
    let btns = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    let axes = [0, 0, 0, 0];
    const mockPad = () =>
      ({
        index: 0,
        id: 'Standard Gamepad',
        connected: true,
        mapping: 'standard',
        axes,
        buttons: btns.map((b) => ({ ...b, touched: b.pressed })),
        timestamp: performance.now(),
      }) as unknown as Gamepad;

    input.destroy();
    input = new InputManager({
      gamepadProvider: () => [mockPad()],
    });
    input.setEnabled(false);

    const onStartLocal = vi.fn();
    menu = new MenuSystem({
      container,
      audioManager: audio,
      inputManager: input,
      peerManager: peer,
      callbacks: { onStartLocalGame: onStartLocal },
    });
    menu.showScreen('start');

    // Navigate Start Menu down twice (LOCAL CO-OP -> ONLINE CO-OP -> OPTIONS) with D-Pad Down (13)
    btns[13] = { pressed: true, value: 1 };
    input.pollGamepads();
    btns[13] = { pressed: false, value: 0 };
    input.pollGamepads();

    btns[13] = { pressed: true, value: 1 };
    input.pollGamepads();
    btns[13] = { pressed: false, value: 0 };
    input.pollGamepads();

    // Press A (0) to open OPTIONS
    btns[0] = { pressed: true, value: 1 };
    input.pollGamepads();
    btns[0] = { pressed: false, value: 0 };
    input.pollGamepads();
    expect(menu.getCurrentScreen()).toBe('options');

    // Toggle Single Controller target button in Options (P1 Left -> P2 Right)
    const padTargetBtn = container.querySelector(
      '[data-testid="options-gamepad-target"]'
    ) as HTMLButtonElement;
    expect(padTargetBtn).toBeTruthy();
    expect(padTargetBtn.textContent).toContain('P1');
    padTargetBtn.click();
    expect(input.getSingleGamepadPlayer()).toBe(2);
    expect(
      (container.querySelector('[data-testid="options-gamepad-target"]') as HTMLButtonElement)
        .textContent
    ).toContain('P2');

    // Click P1 Interact Gamepad binding and press Gamepad Button 2 (PAD X) to rebind
    const p1GamepadInteractBtn = container.querySelector(
      '[data-gamepad-binding="p1.Interact"]'
    ) as HTMLButtonElement;
    expect(p1GamepadInteractBtn).toBeTruthy();
    expect(p1GamepadInteractBtn.textContent).toContain('PAD A');
    p1GamepadInteractBtn.click();
    expect(
      container.querySelector('[data-gamepad-binding="p1.Interact"]')?.textContent
    ).toContain('[PRESS BTN]');

    // Pressing a non-Escape keyboard key while [PRESS BTN] (gamepad device) is active must NOT overwrite keyboard binding
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));
    expect(input.getSettings().p1.Interact).toBe('Digit1');
    expect(
      container.querySelector('[data-gamepad-binding="p1.Interact"]')?.textContent
    ).toContain('[PRESS BTN]');

    btns[2] = { pressed: true, value: 1 };
    input.pollGamepads();
    btns[2] = { pressed: false, value: 0 };
    input.pollGamepads();

    // Gamepad binding updated to GamepadButton2 (PAD X), while Keyboard binding remains Digit1 (1)
    expect(input.getGamepadSettings().p1.Interact).toBe('GamepadButton2');
    expect(input.getSettings().p1.Interact).toBe('Digit1');
    expect(
      container.querySelector('[data-gamepad-binding="p1.Interact"]')?.textContent
    ).toContain('PAD X');
    expect(
      container.querySelector('[data-binding="p1.Interact"]')?.textContent
    ).toContain('1');

    // Clicking Keyboard binding ([PRESS KEY]) and pressing a controller button must NOT overwrite Keyboard binding with GamepadButtonX;
    // pressing PAD B (GamepadButton1) cancels [PRESS KEY] rebinding cleanly
    const p1KbInteractBtn = container.querySelector(
      '[data-binding="p1.Interact"]'
    ) as HTMLButtonElement;
    p1KbInteractBtn.click();
    expect(
      container.querySelector('[data-binding="p1.Interact"]')?.textContent
    ).toContain('[PRESS KEY]');

    btns[2] = { pressed: true, value: 1 }; // PAD X ignored while waiting for keyboard key
    input.pollGamepads();
    btns[2] = { pressed: false, value: 0 };
    input.pollGamepads();
    expect(input.getSettings().p1.Interact).toBe('Digit1');
    expect(
      container.querySelector('[data-binding="p1.Interact"]')?.textContent
    ).toContain('[PRESS KEY]');

    btns[1] = { pressed: true, value: 1 }; // PAD B cancels [PRESS KEY] without exiting Options
    input.pollGamepads();
    btns[1] = { pressed: false, value: 0 };
    input.pollGamepads();
    expect(menu.getCurrentScreen()).toBe('options');
    expect(input.getSettings().p1.Interact).toBe('Digit1');
    expect(
      container.querySelector('[data-binding="p1.Interact"]')?.textContent
    ).toContain('1');

    // Reset Controls button restores default Keyboard & Gamepad bindings
    const resetBtn = container.querySelector(
      '[data-testid="options-reset-controls"]'
    ) as HTMLButtonElement;
    expect(resetBtn).toBeTruthy();
    resetBtn.click();
    expect(input.getGamepadSettings().p1.Interact).toBe('GamepadButton0');
    expect(
      container.querySelector('[data-gamepad-binding="p1.Interact"]')?.textContent
    ).toContain('PAD A');

    // Press B (1) on Options screen -> returns to Start Screen immediately (not swallowed after PAD X rebind!)
    btns[1] = { pressed: true, value: 1 };
    input.pollGamepads();
    btns[1] = { pressed: false, value: 0 };
    input.pollGamepads();
    expect(menu.getCurrentScreen()).toBe('start');

    // Navigate down then up back to LOCAL CO-OP (index 0) using Left Stick
    axes = [0, 0.9, 0, 0];
    input.pollGamepads();
    axes = [0, 0, 0, 0];
    input.pollGamepads();

    axes = [0, -0.9, 0, 0];
    input.pollGamepads();
    axes = [0, 0, 0, 0];
    input.pollGamepads();

    // Press A (0) to open Tutorial, then press A (0) again to start Local Game
    btns[0] = { pressed: true, value: 1 };
    input.pollGamepads();
    btns[0] = { pressed: false, value: 0 };
    input.pollGamepads();
    expect(menu.getCurrentScreen()).toBe('tutorial');

    btns[0] = { pressed: true, value: 1 };
    input.pollGamepads();
    expect(onStartLocal).toHaveBeenCalledTimes(1);
  });
});
