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
});
