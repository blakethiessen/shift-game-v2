// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ShiftGameApp } from '../../src/app';
import { AudioManager } from '../../src/audio/audioManager';
import { InMemoryPeerBus, PeerManager } from '../../src/net/peerManager';
import { SIMULATION_TICK_MS } from '../../src/shared/types';

function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 650;

  const mockCtx = {
    canvas,
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    font: '12px monospace',
    textAlign: 'left',
    textBaseline: 'top',
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    rect: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    setLineDash: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx);
  return canvas;
}

describe('ShiftGameApp End-to-End Integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  it('starts a Local Co-op game, steps simulation, shifts dimensions, and renders 1000x650 dual view', () => {
    const container = document.createElement('div');
    const canvas = createMockCanvas();
    container.appendChild(canvas);
    document.body.appendChild(container);

    const app = new ShiftGameApp({
      container,
      canvas,
      canvasFactory: () => createMockCanvas(),
      autoStartLoop: false,
    });

    expect(app.getMenuSystem().getCurrentScreen()).toBe('start');

    // Start local game via callback
    app.startLocalGame({
      mode: 'local',
      partnerVisibility: 'strict',
      shiftMode: 'cooperative',
      muffledCrossDimensionAudio: true,
    });

    expect(app.isRunning()).toBe(true);
    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(650);
    expect(app.getState().evilOnLeft).toBe(false);

    // Move Player 1 right (KeyD) and trigger shared Shift (ShiftLeft)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    const initialX = app.getState().players[0].x;
    app.stepFrame(SIMULATION_TICK_MS);
    expect(app.getState().players[0].x).toBeGreaterThan(initialX);

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    app.stepFrame(SIMULATION_TICK_MS);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));

    expect(app.getState().evilOnLeft).toBe(true);

    app.destroy();
  });

  it('synchronizes Online P2P Co-op between Host (P1 Left 500x650) and Client (P2 Right 500x650) including Cooperative Shift', async () => {
    const bus = new InMemoryPeerBus();

    const hostContainer = document.createElement('div');
    const hostCanvas = createMockCanvas();
    hostContainer.appendChild(hostCanvas);
    document.body.appendChild(hostContainer);

    const clientContainer = document.createElement('div');
    const clientCanvas = createMockCanvas();
    clientContainer.appendChild(clientCanvas);
    document.body.appendChild(clientContainer);

    const hostPeer = new PeerManager({ peerFactory: bus.createPeerFactory() });
    const clientPeer = new PeerManager({ peerFactory: bus.createPeerFactory() });

    const hostTarget = new EventTarget();
    const clientTarget = new EventTarget();

    const hostApp = new ShiftGameApp({
      container: hostContainer,
      canvas: hostCanvas,
      canvasFactory: () => createMockCanvas(),
      peerManager: hostPeer,
      inputTarget: hostTarget,
      autoStartLoop: false,
    });

    const clientApp = new ShiftGameApp({
      container: clientContainer,
      canvas: clientCanvas,
      canvasFactory: () => createMockCanvas(),
      peerManager: clientPeer,
      inputTarget: clientTarget,
      autoStartLoop: false,
    });

    const code = await hostPeer.hostRoom('K7M9P');
    await clientPeer.joinRoom(code);

    const onlineConfig = {
      mode: 'online' as const,
      partnerVisibility: 'echo' as const,
      shiftMode: 'cooperative' as const,
      muffledCrossDimensionAudio: true,
    };

    hostApp.startOnlineGame(onlineConfig, true);
    clientApp.startOnlineGame(onlineConfig, false);

    // Both canvases must resize to 500x650 single-dimension view!
    expect(hostCanvas.width).toBe(500);
    expect(clientCanvas.width).toBe(500);
    expect(hostApp.getLocalPlayerId()).toBe(1);
    expect(clientApp.getLocalPlayerId()).toBe(2);

    // 1. Client (Player 2) presses WASD ('KeyD') on their own computer
    clientTarget.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    const p2InitialX = hostApp.getState().players[1].x;

    // Client steps frame -> sends InputPacket to Host -> Host steps frame -> broadcasts StatePacket to Client
    clientApp.stepFrame(SIMULATION_TICK_MS);
    hostApp.stepFrame(SIMULATION_TICK_MS);
    clientApp.stepFrame(SIMULATION_TICK_MS);

    expect(hostApp.getState().players[1].x).toBeGreaterThan(p2InitialX);
    expect(clientApp.getState().players[1].x).toBe(hostApp.getState().players[1].x);
    clientTarget.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));

    // 2. Cooperative Shift: Host (Player 1) presses ShiftLeft -> opens shiftRequest window
    hostTarget.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    hostApp.stepFrame(SIMULATION_TICK_MS);
    hostTarget.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));

    expect(hostApp.getState().shiftRequest.requestedBy).toBe(1);
    expect(hostApp.getState().evilOnLeft).toBe(false);
    expect(clientApp.getState().shiftRequest.requestedBy).toBe(1);

    // 3. Client (Player 2) presses ShiftLeft to confirm Cooperative Shift!
    clientTarget.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    clientApp.stepFrame(SIMULATION_TICK_MS);
    clientTarget.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));

    hostApp.stepFrame(SIMULATION_TICK_MS);

    expect(hostApp.getState().evilOnLeft).toBe(true);
    expect(clientApp.getState().evilOnLeft).toBe(true);
    expect(hostApp.getState().shiftRequest.requestedBy).toBeNull();

    // 4. Mid-game disconnect from Client -> Host detects disconnect, stops running, and returns to Lobby screen
    clientPeer.disconnect();
    expect(hostApp.isRunning()).toBe(false);
    expect(hostCanvas.width).toBe(1000);

    // Returning to title in online mode disconnects PeerManager cleanly
    const disconnectSpy = vi.spyOn(hostPeer, 'disconnect');
    hostApp.returnToTitle();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);

    hostApp.destroy();
    clientApp.destroy();
  });

  it('dispatches each playSound GameEvent exactly once per tick (no duplicate audio playback)', () => {
    const canvas = createMockCanvas();
    const uiContainer = document.createElement('div');
    document.body.appendChild(canvas);
    document.body.appendChild(uiContainer);

    const realAudio = new AudioManager();
    const playSoundSpy = vi.spyOn(realAudio, 'playSound');

    const inputTarget = new EventTarget();
    const app = new ShiftGameApp({
      canvas,
      container: uiContainer,
      audioManager: realAudio,
      inputTarget,
      canvasFactory: () => createMockCanvas(),
      autoStartLoop: false,
    });

    app.startLocalGame();
    playSoundSpy.mockClear();

    // Trigger dimension shift -> emits 'shift' playSound event
    inputTarget.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    app.stepFrame(SIMULATION_TICK_MS);
    inputTarget.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));

    // Ensure 'shift' sound is played exactly once (not duplicated by ShiftGameApp + AudioManager)
    const shiftCalls = playSoundSpy.mock.calls.filter(
      (call) => call[0] === 'shift'
    );
    expect(shiftCalls.length).toBe(1);

    app.destroy();
  });

  it('supports Mobile Controls in both Local Co-op (head-to-head opposite ends) and Online P2P Co-op', async () => {
    const container = document.createElement('div');
    const canvas = createMockCanvas();
    container.appendChild(canvas);
    document.body.appendChild(container);

    const app = new ShiftGameApp({
      container,
      canvas,
      canvasFactory: () => createMockCanvas(),
      autoStartLoop: false,
      mobileControlsEnabled: true,
    });

    app.startLocalGame({
      mode: 'local',
      partnerVisibility: 'strict',
      shiftMode: 'cooperative',
      muffledCrossDimensionAudio: true,
    });

    // Verify head-to-head stations are rendered in the UI container
    const station1 = container.querySelector('[data-testid="mobile-station-p1"]') as HTMLElement;
    const station2 = container.querySelector('[data-testid="mobile-station-p2"]') as HTMLElement;
    expect(station1).toBeTruthy();
    expect(station2).toBeTruthy();

    // Right-thumb Shift button on P2 station requests Cooperative Shift, and P1 confirms!
    const shiftBtnP1 = container.querySelector('[data-testid="mobile-btn-shift-p1"]') as HTMLButtonElement;
    const shiftBtnP2 = container.querySelector('[data-testid="mobile-btn-shift-p2"]') as HTMLButtonElement;
    expect(shiftBtnP1).toBeTruthy();
    expect(shiftBtnP2).toBeTruthy();
    expect(app.getState().evilOnLeft).toBe(false);

    // P2 taps SHIFT -> opens cooperative shift request window and highlights shift buttons
    shiftBtnP2.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    app.stepFrame(SIMULATION_TICK_MS);
    expect(app.getState().shiftRequest.requestedBy).toBe(2);
    expect(shiftBtnP1.classList.contains('is-shift-pending')).toBe(true);

    // P1 taps SHIFT -> confirms cooperative shift!
    shiftBtnP1.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    app.stepFrame(SIMULATION_TICK_MS);
    expect(app.getState().evilOnLeft).toBe(true);
    expect(shiftBtnP1.classList.contains('is-shift-pending')).toBe(false);

    app.destroy();
  });

  it('supports live Viewport Camera Zoom via HUD controls, keyboard shortcuts, and API while moving around', () => {
    const container = document.createElement('div');
    const canvas = createMockCanvas();
    container.appendChild(canvas);
    document.body.appendChild(container);

    const inputTarget = new EventTarget();
    const app = new ShiftGameApp({
      container,
      canvas,
      inputTarget,
      canvasFactory: () => createMockCanvas(),
      autoStartLoop: false,
      mobileControlsEnabled: false,
    });

    app.startLocalGame();
    expect(app.getCameraZoom()).toBe(1.0);

    // HUD zoom bar should be visible during gameplay
    const hudZoomIn = container.querySelector('[data-testid="hud-zoom-in"]') as HTMLButtonElement;
    const hudZoomOut = container.querySelector('[data-testid="hud-zoom-out"]') as HTMLButtonElement;
    const hudZoomValue = container.querySelector('[data-testid="hud-zoom-value"]') as HTMLButtonElement;
    const hudZoomSlider = container.querySelector('[data-testid="hud-zoom-slider"]') as HTMLInputElement;
    expect(hudZoomIn).toBeTruthy();
    expect(hudZoomOut).toBeTruthy();
    expect(hudZoomValue).toBeTruthy();
    expect(hudZoomSlider).toBeTruthy();

    // Click HUD Zoom In (+) -> 1.25x
    hudZoomIn.click();
    expect(app.getCameraZoom()).toBe(1.25);
    expect(hudZoomValue.textContent).toContain('1.25x');

    // Drag HUD Zoom Slider -> 2.25x
    hudZoomSlider.value = '2.25';
    hudZoomSlider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(app.getCameraZoom()).toBe(2.25);
    expect(hudZoomValue.textContent).toContain('2.25x');

    // Keyboard shortcut Equal (+) -> 2.5x, Minus (-) -> 2.25x, Digit0 (0) -> reset 1.0x
    inputTarget.dispatchEvent(new KeyboardEvent('keydown', { code: 'Equal' }));
    expect(app.getCameraZoom()).toBe(2.5);

    inputTarget.dispatchEvent(new KeyboardEvent('keydown', { code: 'Minus' }));
    expect(app.getCameraZoom()).toBe(2.25);

    inputTarget.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit0' }));
    expect(app.getCameraZoom()).toBe(1.0);

    // Browser modifier shortcuts (Ctrl + Equal) must be ignored by in-game zoom
    inputTarget.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Equal', ctrlKey: true })
    );
    expect(app.getCameraZoom()).toBe(1.0);

    // Arrow keys pressed on the HUD zoom slider must be prevented/blurred so P2 Arrow keys aren't hijacked
    const keydownOnSlider = new KeyboardEvent('keydown', {
      code: 'ArrowRight',
      cancelable: true,
    });
    hudZoomSlider.dispatchEvent(keydownOnSlider);
    expect(keydownOnSlider.defaultPrevented).toBe(true);

    // If a player binds an action to Equal, pressing Equal triggers that action and does NOT change zoom
    app.getMenuSystem()['inputManager'].updateBinding('p2', 'UseItem', 'Equal');
    inputTarget.dispatchEvent(new KeyboardEvent('keydown', { code: 'Equal' }));
    expect(app.getCameraZoom()).toBe(1.0);

    app.destroy();
  });

  it('defaults to integer-snapped proportional fit to window and supports configurable Window Scale modes and live window resize', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 960,
    });

    const stage = document.createElement('div');
    stage.id = 'game-stage';
    const canvas = createMockCanvas();
    const uiOverlay = document.createElement('div');
    uiOverlay.id = 'ui-overlay';
    stage.appendChild(canvas);
    stage.appendChild(uiOverlay);
    document.body.appendChild(stage);

    const app = new ShiftGameApp({
      container: uiOverlay,
      canvas,
      canvasFactory: () => createMockCanvas(),
      autoStartLoop: false,
      mobileControlsEnabled: false,
    });

    // Default mode is 'fit' (integer-tile-snapped proportional fit)
    // On 1920x960 for 1000x650: tilePx = 36 -> 1440x936 (scale 1.44)
    expect(app.getWindowScaleMode()).toBe('fit');
    expect(canvas.style.width).toBe('1440px');
    expect(canvas.style.height).toBe('936px');
    expect(stage.style.width).toBe('1440px');
    expect(stage.style.height).toBe('936px');

    const menuEl = uiOverlay.querySelector('.shift-menu-overlay') as HTMLElement;
    expect(menuEl.style.transform).toBe('scale(1.44, 1.44)');

    // Start Online Game (500x650 single dimension) -> width becomes 20 * 36 = 720px, height 936px
    app.startOnlineGame(
      {
        mode: 'online',
        partnerVisibility: 'strict',
        shiftMode: 'cooperative',
        muffledCrossDimensionAudio: true,
      },
      true
    );
    expect(canvas.width).toBe(500);
    expect(canvas.style.width).toBe('720px');
    expect(canvas.style.height).toBe('936px');

    // Cycle HUD window scale button: 'fit' -> 'integer' -> 'stretch' -> 'native' -> 'fit'
    const hudScaleBtn = uiOverlay.querySelector(
      '[data-testid="hud-window-scale"]'
    ) as HTMLButtonElement;
    expect(hudScaleBtn).toBeTruthy();
    expect(hudScaleBtn.textContent).toContain('FIT');

    hudScaleBtn.click();
    expect(app.getWindowScaleMode()).toBe('integer');
    expect(canvas.style.width).toBe('500px');
    expect(canvas.style.height).toBe('650px');

    // Resize browser window to 2560x1440 while in 'integer' mode -> 2x (1000x1300 for online 500x650)
    window.innerWidth = 2560;
    window.innerHeight = 1440;
    window.dispatchEvent(new Event('resize'));
    expect(canvas.style.width).toBe('1000px');
    expect(canvas.style.height).toBe('1300px');

    // Cycle to 'stretch' -> fills 2560x1440
    hudScaleBtn.click();
    expect(app.getWindowScaleMode()).toBe('stretch');
    expect(canvas.style.width).toBe('2560px');
    expect(canvas.style.height).toBe('1440px');

    // Cycle to 'native' -> fixed 1x (500x650)
    hudScaleBtn.click();
    expect(app.getWindowScaleMode()).toBe('native');
    expect(canvas.style.width).toBe('500px');
    expect(canvas.style.height).toBe('650px');
    expect(window.localStorage.getItem('shift_game_window_scale_v1')).toBe(
      'native'
    );

    // Switch back to 'fit' on a narrow mobile viewport (390x844):
    // Start menu uses .is-compact-mobile (unscaled transform), whereas gameOver/victory banners scale 1000x650
    app.setWindowScaleMode('fit');
    window.innerWidth = 390;
    window.innerHeight = 844;
    app.returnToTitle();
    expect(menuEl.classList.contains('is-compact-mobile')).toBe(true);
    expect(menuEl.style.transform).toBe('');

    app.getMenuSystem().showScreen('gameOver');
    expect(menuEl.classList.contains('is-compact-mobile')).toBe(false);
    expect(menuEl.style.transform).toContain('scale(');

    app.destroy();
  });

  it('supports Multiplayer Testing Mode (no darkness + Blobby/Tear HP display) and edge Controls HUD matching menu bindings', () => {
    const container = document.createElement('div');
    const canvas = createMockCanvas();
    container.appendChild(canvas);
    document.body.appendChild(container);

    const app = new ShiftGameApp({
      container,
      canvas,
      canvasFactory: () => createMockCanvas(),
      autoStartLoop: false,
      mobileControlsEnabled: false,
    });

    // Enable Multiplayer Testing Mode in Options menu and rebind P1 Interact to KeyF & Common SwitchDimensions to Space
    app.getMenuSystem().showScreen('options');
    const testingToggleBtn = container.querySelector(
      '[data-testid="options-testing-mode"]'
    ) as HTMLButtonElement;
    expect(testingToggleBtn).toBeTruthy();
    testingToggleBtn.click();
    expect(app.getTestingMode()).toBe(true);

    const p1InteractBtn = container.querySelector(
      '[data-binding="p1.Interact"]'
    ) as HTMLButtonElement;
    p1InteractBtn.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));

    const shiftBindBtn = container.querySelector(
      '[data-binding="common.SwitchDimensions"]'
    ) as HTMLButtonElement;
    shiftBindBtn.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

    // Start local game
    app.startLocalGame(app.getMenuSystem().getLobbyConfig());

    // Controls HUD on the edge of the screen must be visible, use the retro double-bordered frame & spritesheet icons, and reflect the rebound keys ('F' and 'SPACE')
    const controlsHud = container.querySelector(
      '[data-testid="shift-controls-hud"]'
    ) as HTMLElement;
    expect(controlsHud).toBeTruthy();
    expect(controlsHud.classList.contains('is-hidden')).toBe(false);
    expect(controlsHud.querySelector('.controls-hud-inner-frame')).toBeTruthy();
    expect(
      controlsHud.querySelector('[data-testid="controls-hud-icon-p1"]')
    ).toBeTruthy();
    expect(
      controlsHud.querySelector('[data-testid="controls-hud-icon-common"]')
    ).toBeTruthy();
    expect(
      controlsHud.querySelector('[data-testid="controls-hud-icon-p2"]')
    ).toBeTruthy();
    expect(controlsHud.textContent).toContain('F');
    expect(controlsHud.textContent).toContain('SPACE');

    // Updating a binding dynamically also updates the Controls HUD immediately
    app.getMenuSystem()['inputManager'].updateBinding('p2', 'UseItem', 'KeyK');
    expect(controlsHud.textContent).toContain('K');

    // Place a Blobby and a Dimension Tear in spawnRoom and verify their HP is drawn in Testing Mode
    const state = app.getState();
    state.room.tears.push({
      id: 'test-tear-hud',
      x: 200,
      y: 250,
      angle: 9,
      stage: 3, // 4/5 HP
      growthTimerMs: 3000,
      hasSpread: false,
    });
    state.room.worlds.neutral.blobbies.push({
      id: 'test-blobby-hud',
      world: 'neutral',
      x: 250,
      y: 250,
      velocity: { x: 0, y: 0 },
      direction: 7,
      state: 'Wandering',
      currentSpeed: 0.8,
      wanderTimerTicks: 0,
      wanderIntervalTicks: 40,
      eatingTimerTicks: 0,
      path: [],
      nextStepIdx: 0,
      nextStep: null,
      oldTargetCoord: { x: 0, y: 0 },
      hp: 2,
      maxHp: 3,
    });

    const ctx = canvas.getContext('2d') as any;
    ctx.fillText.mockClear();
    app.stepFrame(SIMULATION_TICK_MS);

    const renderedTexts = ctx.fillText.mock.calls.map((c: unknown[]) => c[0]).join(' | ');
    expect(renderedTexts).toContain('4/5');
    expect(renderedTexts).toContain('2/3');

    app.destroy();
  });

  it('supports Local Co-op gameplay with two Gamepad controllers and dynamically updates Controls HUD and Shift prompts', () => {
    const pad1Btns = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    const pad2Btns = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    let pad1Axes = [0, 0, 0, 0];
    let pad2Axes = [0, 0, 0, 0];

    const makePad = (
      index: number,
      axes: number[],
      btns: Array<{ pressed: boolean; value: number }>
    ) =>
      ({
        index,
        id: `Controller #${index}`,
        connected: true,
        mapping: 'standard',
        axes,
        buttons: btns.map((b) => ({ ...b, touched: b.pressed })),
        timestamp: performance.now(),
      }) as unknown as Gamepad;

    const getGamepadsSpy = vi
      .fn(() => [makePad(0, pad1Axes, pad1Btns), makePad(1, pad2Axes, pad2Btns)]);
    Object.defineProperty(navigator, 'getGamepads', {
      value: getGamepadsSpy,
      configurable: true,
      writable: true,
    });

    const container = document.createElement('div');
    const canvas = createMockCanvas();
    container.appendChild(canvas);
    document.body.appendChild(container);

    const app = new ShiftGameApp({
      container,
      canvas,
      canvasFactory: () => createMockCanvas(),
      autoStartLoop: false,
      mobileControlsEnabled: false,
    });

    app.startLocalGame({
      mode: 'local',
      partnerVisibility: 'strict',
      shiftMode: 'cooperative',
      muffledCrossDimensionAudio: true,
    });

    const p1StartX = app.getState().players[0].x;
    const p2StartX = app.getState().players[1].x;

    // Pad 0 moves P1 right via Left Stick, Pad 1 moves P2 left via D-Pad Left (14)
    pad1Axes = [0.95, 0, 0, 0];
    pad2Btns[14] = { pressed: true, value: 1 };
    app.stepFrame(SIMULATION_TICK_MS);

    expect(app.getState().players[0].x).toBeGreaterThan(p1StartX);
    expect(app.getState().players[1].x).toBeLessThan(p2StartX);

    // Controls HUD should now reflect Gamepad button labels for both P1 and P2
    const controlsHud = container.querySelector(
      '[data-testid="shift-controls-hud"]'
    ) as HTMLElement;
    expect(controlsHud.textContent).toContain('PAD A');
    expect(controlsHud.textContent).toContain('PAD RB');

    // Pad 0 presses RB (5) to request Cooperative Shift -> Pad 1 presses RB (5) to confirm
    pad1Axes = [0, 0, 0, 0];
    pad2Btns[14] = { pressed: false, value: 0 };
    pad1Btns[5] = { pressed: true, value: 1 };
    app.stepFrame(SIMULATION_TICK_MS);
    expect(app.getState().shiftRequest.requestedBy).toBe(1);
    expect(app.getState().evilOnLeft).toBe(false);

    pad1Btns[5] = { pressed: false, value: 0 };
    pad2Btns[5] = { pressed: true, value: 1 };
    app.stepFrame(SIMULATION_TICK_MS);
    expect(app.getState().evilOnLeft).toBe(true);

    app.destroy();
  });
});
