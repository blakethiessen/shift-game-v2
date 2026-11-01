// src/input/mobileControls.ts
// Mobile & Touch Controls for both Local Co-op (head-to-head opposite ends of the phone
// with 180-degree opposite player stations) and Online P2P Co-op (single-player view).
// Left thumb: smooth 8-way virtual thumbstick (joystick).
// Right thumb: ergonomic action & dimension-shift button cluster.

import {
  DIM_HEIGHT_PX,
  DIM_WIDTH_PX,
  GameState,
  PlayMode,
  PlayerId,
  Vector2D,
} from '../shared/types';
import { InputManager } from './inputManager';

export const DEFAULT_JOYSTICK_MAX_RADIUS_PX = 38;
export const DEFAULT_JOYSTICK_DEADZONE_PX = 10;
export const OCTANT_THRESHOLD = Math.sin(Math.PI / 8); // ~0.3826834
export const MOBILE_CONTROLS_STORAGE_KEY = 'shift_game_mobile_controls_v1';

export interface JoystickState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  knobX: number;
  knobY: number;
  magnitude: number;
}

export interface LocalCoopStationLayout {
  splitAxis: 'horizontal' | 'vertical';
  p1RotationDeg: number;
  p2RotationDeg: number;
}

/**
 * Rotates a screen-space pointer displacement (screenDx, screenDy) by -rotationDeg
 * into the player station's local upright coordinate space.
 */
export function transformScreenDeltaToLocal(
  screenDx: number,
  screenDy: number,
  rotationDeg: number
): Vector2D {
  const normDeg = (((rotationDeg % 360) + 360) % 360);
  let x: number;
  let y: number;

  if (normDeg === 0) {
    x = screenDx;
    y = screenDy;
  } else if (normDeg === 180) {
    x = -screenDx;
    y = -screenDy;
  } else if (normDeg === 90) {
    // Station rotated 90 deg CW: local +x is screen +y, local +y is screen -x
    x = screenDy;
    y = -screenDx;
  } else if (normDeg === 270) {
    // Station rotated -90 deg (270 deg CW): local +x is screen -y, local +y is screen +x
    x = -screenDy;
    y = screenDx;
  } else {
    const rad = (-rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    x = screenDx * cos - screenDy * sin;
    y = screenDx * sin + screenDy * cos;
  }

  return {
    x: Object.is(x, -0) ? 0 : x,
    y: Object.is(y, -0) ? 0 : y,
  };
}

/**
 * Computes 8-way directional booleans and clamped knob offset from local joystick displacement.
 */
export function computeJoystickState(
  localDx: number,
  localDy: number,
  maxRadiusPx: number = DEFAULT_JOYSTICK_MAX_RADIUS_PX,
  deadzonePx: number = DEFAULT_JOYSTICK_DEADZONE_PX
): JoystickState {
  const dist = Math.hypot(localDx, localDy);
  if (dist < deadzonePx || dist === 0) {
    return {
      up: false,
      down: false,
      left: false,
      right: false,
      knobX: 0,
      knobY: 0,
      magnitude: 0,
    };
  }

  const clampedDist = Math.min(dist, maxRadiusPx);
  const ux = localDx / dist;
  const uy = localDy / dist;

  const knobX = ux * clampedDist;
  const knobY = uy * clampedDist;

  return {
    up: uy < -OCTANT_THRESHOLD,
    down: uy > OCTANT_THRESHOLD,
    left: ux < -OCTANT_THRESHOLD,
    right: ux > OCTANT_THRESHOLD,
    knobX: Object.is(knobX, -0) ? 0 : knobX,
    knobY: Object.is(knobY, -0) ? 0 : knobY,
    magnitude: Math.min(1, dist / maxRadiusPx),
  };
}

/**
 * Computes the head-to-head station rotations so two players holding opposite short ends
 * of the phone long-ways always see their viewport and controls right-side-up facing their end.
 */
export function computeLocalCoopStationRotations(
  viewportWidth: number,
  viewportHeight: number
): LocalCoopStationLayout {
  if (viewportWidth >= viewportHeight) {
    // Landscape: Phone held horizontally long-ways.
    // Player 1 holds Left short end (facing right -> +90deg CW).
    // Player 2 holds Right short end (facing left -> -90deg CCW).
    return {
      splitAxis: 'horizontal',
      p1RotationDeg: 90,
      p2RotationDeg: -90,
    };
  }
  // Portrait: Phone held vertically long-ways between the two players.
  // Player 1 holds Bottom short end (facing up -> 0deg).
  // Player 2 holds Top short end (facing down -> 180deg).
  return {
    splitAxis: 'vertical',
    p1RotationDeg: 0,
    p2RotationDeg: 180,
  };
}

interface ActiveJoystickTracker {
  playerId: PlayerId;
  active: boolean;
  pointerId: number | null;
  baseEl: HTMLElement;
  knobEl: HTMLElement;
  getRotationDeg: () => number;
}

export interface MobileControlsOptions {
  container: HTMLElement;
  inputManager: InputManager;
  forceEnabled?: boolean | null;
  viewportSizeProvider?: () => { width: number; height: number };
  canvasFactory?: (w: number, h: number) => HTMLCanvasElement;
  storage?: Storage | null;
  onZoomDelta?: (delta: number) => void;
  onZoomCycle?: () => void;
}

export class MobileControls {
  private readonly container: HTMLElement;
  private readonly inputManager: InputManager;
  private readonly rootEl: HTMLElement;
  private readonly viewportSizeProvider: () => { width: number; height: number };
  private readonly canvasFactory: (w: number, h: number) => HTMLCanvasElement;
  private readonly storage: Storage | null;

  private forceEnabled: boolean | null;
  private detectedTouch = false;
  private sessionActive = false;
  private mode: PlayMode = 'local';
  private localPlayerId: PlayerId = 1;

  private lastMainCanvas: HTMLCanvasElement | null = null;
  private lastState: GameState | undefined = undefined;

  private p1StationEl: HTMLElement | null = null;
  private p2StationEl: HTMLElement | null = null;
  private p1StationCanvas: HTMLCanvasElement | null = null;
  private p2StationCanvas: HTMLCanvasElement | null = null;
  private p1StationCtx: CanvasRenderingContext2D | null = null;
  private p2StationCtx: CanvasRenderingContext2D | null = null;
  private p1RotationDeg = 0;
  private p2RotationDeg = 180;

  private shiftButtons: HTMLButtonElement[] = [];
  private pauseButtons: HTMLButtonElement[] = [];
  private zoomCycleButtons: HTMLButtonElement[] = [];
  private currentZoomDisplay = 1.0;
  private readonly onZoomDelta?: (delta: number) => void;
  private readonly onZoomCycle?: () => void;
  private allInteractiveButtons: HTMLButtonElement[] = [];
  private joystickTrackers: ActiveJoystickTracker[] = [];
  private lastPressedJoystick: ActiveJoystickTracker | null = null;

  private readonly boundPointerMove: (e: Event) => void;
  private readonly boundPointerUp: (e: Event) => void;
  private readonly boundResize: () => void;
  private readonly boundFirstTouch: (e: Event) => void;
  private readonly boundBlur: () => void;

  constructor(options: MobileControlsOptions) {
    this.container = options.container;
    this.inputManager = options.inputManager;
    this.onZoomDelta = options.onZoomDelta;
    this.onZoomCycle = options.onZoomCycle;
    this.storage =
      options.storage !== undefined
        ? options.storage
        : typeof localStorage !== 'undefined'
        ? localStorage
        : null;

    this.forceEnabled =
      options.forceEnabled !== undefined
        ? options.forceEnabled
        : this.loadPersistedForceState();

    this.viewportSizeProvider =
      options.viewportSizeProvider ??
      (() => ({
        width: typeof window !== 'undefined' ? window.innerWidth : 1024,
        height: typeof window !== 'undefined' ? window.innerHeight : 768,
      }));

    this.canvasFactory =
      options.canvasFactory ??
      ((w: number, h: number) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
      });

    this.detectedTouch = this.detectTouchEnvironment();

    this.rootEl = document.createElement('div');
    this.rootEl.className = 'shift-mobile-controls is-hidden';
    this.container.appendChild(this.rootEl);

    this.boundPointerMove = (e: Event) =>
      this.handleGlobalPointerMove(e as PointerEvent);
    this.boundPointerUp = (e: Event) =>
      this.handleGlobalPointerUp(e as PointerEvent);
    this.boundResize = () => this.updateOrientationLayout();
    this.boundBlur = () => this.releaseAllInputs();
    this.boundFirstTouch = (e: Event) => {
      const pe = e as PointerEvent;
      if (e.type === 'touchstart' || pe.pointerType === 'touch') {
        if (!this.detectedTouch) {
          this.detectedTouch = true;
          if (this.sessionActive) {
            this.render();
          }
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', this.boundPointerMove);
      window.addEventListener('pointerup', this.boundPointerUp);
      window.addEventListener('pointercancel', this.boundPointerUp);
      window.addEventListener('resize', this.boundResize);
      window.addEventListener('orientationchange', this.boundResize);
      window.addEventListener('blur', this.boundBlur);
      window.addEventListener('touchstart', this.boundFirstTouch, {
        passive: true,
      });
      window.addEventListener('pointerdown', this.boundFirstTouch, {
        passive: true,
      });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.boundBlur);
    }
  }

  private loadPersistedForceState(): boolean | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(MOBILE_CONTROLS_STORAGE_KEY);
      if (raw === 'on') return true;
      if (raw === 'off') return false;
      return null;
    } catch {
      return null;
    }
  }

  private savePersistedForceState(val: boolean | null): void {
    if (!this.storage) return;
    try {
      const str = val === null ? 'auto' : val ? 'on' : 'off';
      this.storage.setItem(MOBILE_CONTROLS_STORAGE_KEY, str);
    } catch {
      // Ignore storage errors
    }
  }

  private detectTouchEnvironment(): boolean {
    if (typeof window === 'undefined') return false;
    if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) {
      return true;
    }
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
    ) {
      return true;
    }
    const params = new URLSearchParams(window.location?.search ?? '');
    if (params.get('mobile') === '1' || params.get('touch') === '1') {
      return true;
    }
    return false;
  }

  public isEnabled(): boolean {
    if (this.forceEnabled !== null) {
      return this.forceEnabled;
    }
    return this.detectedTouch;
  }

  public setForceEnabled(enabled: boolean | null): void {
    this.forceEnabled = enabled;
    this.savePersistedForceState(enabled);
    if (this.sessionActive) {
      this.render();
    }
  }

  public getForceEnabled(): boolean | null {
    return this.forceEnabled;
  }

  public setZoomDisplay(zoom: number): void {
    this.currentZoomDisplay = zoom;
    const label = `${Number(zoom.toFixed(2))}x`;
    for (const btn of this.zoomCycleButtons) {
      btn.textContent = label;
    }
  }

  public setSessionMode(
    mode: PlayMode,
    localPlayerId: PlayerId,
    active: boolean
  ): void {
    this.mode = mode;
    this.localPlayerId = localPlayerId;
    this.sessionActive = active;
    this.render();
  }

  public updateOrientationLayout(): void {
    if (!this.sessionActive || !this.isEnabled() || this.mode !== 'local') {
      return;
    }
    const { width, height } = this.viewportSizeProvider();
    const layout = computeLocalCoopStationRotations(width, height);
    this.p1RotationDeg = layout.p1RotationDeg;
    this.p2RotationDeg = layout.p2RotationDeg;

    this.rootEl.setAttribute('data-split-axis', layout.splitAxis);

    const slotFirst = this.rootEl.querySelector('.slot-first');
    const slotSecond = this.rootEl.querySelector('.slot-second');
    if (slotFirst && slotSecond && this.p1StationEl && this.p2StationEl) {
      if (layout.splitAxis === 'horizontal') {
        if (this.p1StationEl.parentElement !== slotFirst) {
          slotFirst.appendChild(this.p1StationEl);
        }
        if (this.p2StationEl.parentElement !== slotSecond) {
          slotSecond.appendChild(this.p2StationEl);
        }
      } else {
        if (this.p2StationEl.parentElement !== slotFirst) {
          slotFirst.appendChild(this.p2StationEl);
        }
        if (this.p1StationEl.parentElement !== slotSecond) {
          slotSecond.appendChild(this.p1StationEl);
        }
      }
    }

    const applyStationLayout = (
      stationEl: HTMLElement | null,
      rotationDeg: number
    ) => {
      if (!stationEl) return;
      stationEl.setAttribute('data-rotation', String(rotationDeg));
      if (layout.splitAxis === 'horizontal') {
        const stationW = height;
        const stationH = Math.round(width / 2);
        stationEl.style.width = `${stationW}px`;
        stationEl.style.height = `${stationH}px`;
        stationEl.style.transform = `rotate(${rotationDeg}deg)`;
      } else {
        const stationW = width;
        const stationH = Math.round(height / 2);
        stationEl.style.width = `${stationW}px`;
        stationEl.style.height = `${stationH}px`;
        stationEl.style.transform = `rotate(${rotationDeg}deg)`;
      }
    };

    applyStationLayout(this.p1StationEl, this.p1RotationDeg);
    applyStationLayout(this.p2StationEl, this.p2RotationDeg);
  }

  public syncFromMainCanvas(
    mainCanvas: HTMLCanvasElement,
    state?: GameState
  ): void {
    this.lastMainCanvas = mainCanvas;
    if (state !== undefined) {
      this.lastState = state;
    }

    if (!this.sessionActive || !this.isEnabled()) {
      return;
    }

    if (this.mode === 'local') {
      if (!this.p1StationCtx && this.p1StationCanvas) {
        try {
          this.p1StationCtx = this.p1StationCanvas.getContext('2d');
        } catch {
          this.p1StationCtx = null;
        }
      }
      if (!this.p2StationCtx && this.p2StationCanvas) {
        try {
          this.p2StationCtx = this.p2StationCanvas.getContext('2d');
        } catch {
          this.p2StationCtx = null;
        }
      }
      if (this.p1StationCtx) {
        this.p1StationCtx.clearRect(0, 0, DIM_WIDTH_PX, DIM_HEIGHT_PX);
        this.p1StationCtx.drawImage(
          mainCanvas,
          0,
          0,
          DIM_WIDTH_PX,
          DIM_HEIGHT_PX,
          0,
          0,
          DIM_WIDTH_PX,
          DIM_HEIGHT_PX
        );
      }
      if (this.p2StationCtx) {
        this.p2StationCtx.clearRect(0, 0, DIM_WIDTH_PX, DIM_HEIGHT_PX);
        this.p2StationCtx.drawImage(
          mainCanvas,
          DIM_WIDTH_PX,
          0,
          DIM_WIDTH_PX,
          DIM_HEIGHT_PX,
          0,
          0,
          DIM_WIDTH_PX,
          DIM_HEIGHT_PX
        );
      }
    }

    const activeState = state ?? this.lastState;
    if (activeState) {
      const shiftPending = activeState.shiftRequest.requestedBy !== null;
      for (const btn of this.shiftButtons) {
        btn.classList.toggle('is-shift-pending', shiftPending);
      }
      for (const pBtn of this.pauseButtons) {
        pBtn.classList.toggle('is-active', activeState.isPaused);
        pBtn.textContent = activeState.isPaused ? 'RESUME' : 'PAUSE';
      }
    }
  }

  private render(): void {
    this.releaseAllInputs();
    this.rootEl.innerHTML = '';
    this.p1StationEl = null;
    this.p2StationEl = null;
    this.p1StationCanvas = null;
    this.p2StationCanvas = null;
    this.p1StationCtx = null;
    this.p2StationCtx = null;
    this.shiftButtons = [];
    this.pauseButtons = [];
    this.zoomCycleButtons = [];
    this.allInteractiveButtons = [];
    this.joystickTrackers = [];

    if (!this.sessionActive || !this.isEnabled()) {
      this.rootEl.classList.add('is-hidden');
      this.rootEl.classList.remove(
        'mobile-mode-local',
        'mobile-mode-online'
      );
      return;
    }

    this.rootEl.classList.remove('is-hidden');

    if (this.mode === 'local') {
      this.rootEl.classList.add('mobile-mode-local');
      this.rootEl.classList.remove('mobile-mode-online');
      this.renderLocalHeadToHead();
    } else {
      this.rootEl.classList.add('mobile-mode-online');
      this.rootEl.classList.remove('mobile-mode-local');
      this.renderOnlineSinglePlayer();
    }

    if (this.lastMainCanvas) {
      this.syncFromMainCanvas(this.lastMainCanvas, this.lastState);
    }
  }

  private renderLocalHeadToHead(): void {
    const { width, height } = this.viewportSizeProvider();
    const layout = computeLocalCoopStationRotations(width, height);
    this.p1RotationDeg = layout.p1RotationDeg;
    this.p2RotationDeg = layout.p2RotationDeg;
    this.rootEl.setAttribute('data-split-axis', layout.splitAxis);

    const slotA = document.createElement('div');
    slotA.className = 'mobile-station-slot slot-first';
    const slotB = document.createElement('div');
    slotB.className = 'mobile-station-slot slot-second';

    const p1Built = this.createPlayerStation(
      1,
      'p1',
      () => this.p1RotationDeg,
      true
    );
    const p2Built = this.createPlayerStation(
      2,
      'p2',
      () => this.p2RotationDeg,
      true
    );

    this.p1StationEl = p1Built.stationEl;
    this.p1StationCanvas = p1Built.canvas;
    this.p1StationCtx = p1Built.ctx;

    this.p2StationEl = p2Built.stationEl;
    this.p2StationCanvas = p2Built.canvas;
    this.p2StationCtx = p2Built.ctx;

    if (layout.splitAxis === 'horizontal') {
      slotA.appendChild(this.p1StationEl);
      slotB.appendChild(this.p2StationEl);
    } else {
      slotA.appendChild(this.p2StationEl);
      slotB.appendChild(this.p1StationEl);
    }

    const divider = this.createUtilityBar('mobile-center-divider');

    this.rootEl.appendChild(slotA);
    this.rootEl.appendChild(divider);
    this.rootEl.appendChild(slotB);

    this.updateOrientationLayout();
  }

  private renderOnlineSinglePlayer(): void {
    const station = this.createPlayerStation(
      this.localPlayerId,
      'online',
      () => 0,
      false
    );
    const utilBar = this.createUtilityBar('mobile-online-util-bar');
    this.rootEl.appendChild(utilBar);
    this.rootEl.appendChild(station.stationEl);
  }

  private createUtilityBar(className: string): HTMLElement {
    const bar = document.createElement('div');
    bar.className = className;

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.type = 'button';
    zoomOutBtn.className = 'mobile-util-btn';
    zoomOutBtn.setAttribute('data-testid', 'mobile-btn-zoom-out');
    zoomOutBtn.textContent = '-';
    zoomOutBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onZoomDelta?.(-0.25);
    });
    this.allInteractiveButtons.push(zoomOutBtn);

    const zoomCycleBtn = document.createElement('button');
    zoomCycleBtn.type = 'button';
    zoomCycleBtn.className = 'mobile-util-btn';
    zoomCycleBtn.setAttribute('data-testid', 'mobile-btn-zoom-cycle');
    zoomCycleBtn.textContent = `${Number(this.currentZoomDisplay.toFixed(2))}x`;
    zoomCycleBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onZoomCycle?.();
    });
    this.zoomCycleButtons.push(zoomCycleBtn);
    this.allInteractiveButtons.push(zoomCycleBtn);

    const zoomInBtn = document.createElement('button');
    zoomInBtn.type = 'button';
    zoomInBtn.className = 'mobile-util-btn';
    zoomInBtn.setAttribute('data-testid', 'mobile-btn-zoom-in');
    zoomInBtn.textContent = '+';
    zoomInBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onZoomDelta?.(0.25);
    });
    this.allInteractiveButtons.push(zoomInBtn);

    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.className = 'mobile-util-btn';
    pauseBtn.setAttribute('data-testid', 'mobile-btn-pause');
    pauseBtn.textContent = 'PAUSE';
    pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.inputManager.triggerPause();
    });
    this.pauseButtons.push(pauseBtn);
    this.allInteractiveButtons.push(pauseBtn);

    const muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = 'mobile-util-btn';
    muteBtn.setAttribute('data-testid', 'mobile-btn-mute');
    muteBtn.textContent = 'MUTE';
    muteBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.inputManager.triggerMute();
    });
    this.allInteractiveButtons.push(muteBtn);

    bar.appendChild(zoomOutBtn);
    bar.appendChild(zoomCycleBtn);
    bar.appendChild(zoomInBtn);
    bar.appendChild(pauseBtn);
    bar.appendChild(muteBtn);
    return bar;
  }

  private createPlayerStation(
    playerId: PlayerId,
    suffix: 'p1' | 'p2' | 'online',
    getRotationDeg: () => number,
    includeStationCanvas: boolean
  ): {
    stationEl: HTMLElement;
    canvas: HTMLCanvasElement | null;
    ctx: CanvasRenderingContext2D | null;
  } {
    const stationEl = document.createElement('div');
    stationEl.className = `mobile-player-station station-${suffix}`;
    stationEl.setAttribute('data-testid', `mobile-station-${suffix}`);
    stationEl.setAttribute('data-player-id', String(playerId));
    stationEl.setAttribute('data-rotation', String(getRotationDeg()));

    let canvas: HTMLCanvasElement | null = null;
    const ctx: CanvasRenderingContext2D | null = null;

    if (includeStationCanvas) {
      const viewportWrap = document.createElement('div');
      viewportWrap.className = 'mobile-station-viewport';
      canvas = this.canvasFactory(DIM_WIDTH_PX, DIM_HEIGHT_PX);
      canvas.className = 'mobile-station-canvas';
      canvas.setAttribute('data-testid', `mobile-canvas-${suffix}`);
      viewportWrap.appendChild(canvas);
      stationEl.appendChild(viewportWrap);
    }

    const controlsRow = document.createElement('div');
    controlsRow.className = 'mobile-controls-row';

    // Left thumb: Virtual 8-way Thumbstick (Movement)
    const leftPad = document.createElement('div');
    leftPad.className = 'mobile-thumb-zone thumb-left';

    const joystickBase = document.createElement('div');
    joystickBase.className = 'mobile-joystick-base';
    joystickBase.setAttribute('data-testid', `mobile-joystick-${suffix}`);

    const joystickKnob = document.createElement('div');
    joystickKnob.className = 'mobile-joystick-knob';
    joystickBase.appendChild(joystickKnob);
    leftPad.appendChild(joystickBase);

    const tracker: ActiveJoystickTracker = {
      playerId,
      active: false,
      pointerId: null,
      baseEl: joystickBase,
      knobEl: joystickKnob,
      getRotationDeg,
    };
    this.joystickTrackers.push(tracker);

    joystickBase.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const pe = ev as PointerEvent;
      // Ignore stray second-finger touch if this joystick is already actively held by a pointerId
      if (tracker.active && tracker.pointerId !== null) {
        return;
      }
      tracker.active = true;
      tracker.pointerId = pe.pointerId !== undefined ? pe.pointerId : null;
      this.lastPressedJoystick = tracker;
      joystickBase.classList.add('is-active');
      if (
        pe.pointerId !== undefined &&
        typeof joystickBase.setPointerCapture === 'function'
      ) {
        try {
          joystickBase.setPointerCapture(pe.pointerId);
        } catch {
          // Ignore synthetic events in tests
        }
      }
      this.updateJoystickFromEvent(tracker, pe);
    });

    // Right thumb: Actions & Shifting Cluster
    const rightPad = document.createElement('div');
    rightPad.className = 'mobile-thumb-zone thumb-right';

    const shiftBtn = this.createActionButton(
      `mobile-btn-shift-${suffix}`,
      'SHIFT',
      'mobile-action-btn btn-shift',
      () => {
        this.inputManager.triggerVirtualAction(playerId, 'shift');
      }
    );
    this.shiftButtons.push(shiftBtn);

    const interactBtn = this.createActionButton(
      `mobile-btn-interact-${suffix}`,
      'ACT',
      'mobile-action-btn btn-interact',
      () => {
        this.inputManager.triggerVirtualAction(playerId, 'interact');
      }
    );

    const useBtn = this.createActionButton(
      `mobile-btn-use-${suffix}`,
      'USE',
      'mobile-action-btn btn-use',
      () => {
        this.inputManager.triggerVirtualAction(playerId, 'useItem');
      }
    );

    const invBtn = document.createElement('button');
    invBtn.type = 'button';
    invBtn.className = 'mobile-action-btn btn-inv';
    invBtn.setAttribute('data-testid', `mobile-btn-inv-${suffix}`);
    invBtn.innerHTML = '<span>INV</span><small>DROP</small>';
    this.allInteractiveButtons.push(invBtn);

    let activeInvPointerId: number | null = null;

    invBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pe = e as PointerEvent;
      if (invBtn.classList.contains('is-pressed') && activeInvPointerId !== null) {
        return;
      }
      activeInvPointerId = pe.pointerId !== undefined ? pe.pointerId : null;
      invBtn.classList.add('is-pressed');
      if (
        pe.pointerId !== undefined &&
        typeof invBtn.setPointerCapture === 'function'
      ) {
        try {
          invBtn.setPointerCapture(pe.pointerId);
        } catch {
          // Ignore synthetic events in tests
        }
      }
      this.inputManager.startVirtualInventoryPress(playerId);
    });

    invBtn.addEventListener('pointerup', (e) => {
      e.preventDefault();
      const pe = e as PointerEvent;
      if (!invBtn.classList.contains('is-pressed')) return;
      if (
        activeInvPointerId !== null &&
        pe.pointerId !== undefined &&
        pe.pointerId !== activeInvPointerId
      ) {
        return;
      }
      activeInvPointerId = null;
      invBtn.classList.remove('is-pressed');
      this.inputManager.endVirtualInventoryPress(playerId);
    });

    invBtn.addEventListener('pointercancel', (e) => {
      e.preventDefault();
      const pe = e as PointerEvent;
      if (!invBtn.classList.contains('is-pressed')) return;
      if (
        activeInvPointerId !== null &&
        pe.pointerId !== undefined &&
        pe.pointerId !== activeInvPointerId
      ) {
        return;
      }
      activeInvPointerId = null;
      invBtn.classList.remove('is-pressed');
      this.inputManager.cancelVirtualInventoryPress(playerId);
    });

    const pingBtn = this.createActionButton(
      `mobile-btn-ping-${suffix}`,
      'PING',
      'mobile-action-btn btn-ping',
      () => {
        this.inputManager.triggerVirtualAction(playerId, 'ping');
      }
    );

    rightPad.appendChild(shiftBtn);
    rightPad.appendChild(invBtn);
    rightPad.appendChild(pingBtn);
    rightPad.appendChild(interactBtn);
    rightPad.appendChild(useBtn);

    controlsRow.appendChild(leftPad);
    controlsRow.appendChild(rightPad);
    stationEl.appendChild(controlsRow);

    return { stationEl, canvas, ctx };
  }

  private createActionButton(
    testId: string,
    label: string,
    className: string,
    onPress: () => void
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.setAttribute('data-testid', testId);
    btn.textContent = label;
    this.allInteractiveButtons.push(btn);

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.add('is-pressed');
      onPress();
    });

    const clearPress = () => btn.classList.remove('is-pressed');
    btn.addEventListener('pointerup', clearPress);
    btn.addEventListener('pointercancel', clearPress);
    btn.addEventListener('pointerleave', clearPress);

    return btn;
  }

  private updateJoystickFromEvent(
    tracker: ActiveJoystickTracker,
    e: { clientX: number; clientY: number }
  ): void {
    const rect = tracker.baseEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const screenDx = e.clientX - centerX;
    const screenDy = e.clientY - centerY;
    const localDelta = transformScreenDeltaToLocal(
      screenDx,
      screenDy,
      tracker.getRotationDeg()
    );

    const state = computeJoystickState(localDelta.x, localDelta.y);
    tracker.knobEl.style.transform = `translate3d(${state.knobX}px, ${state.knobY}px, 0)`;

    this.inputManager.setVirtualDirection(tracker.playerId, {
      up: state.up,
      down: state.down,
      left: state.left,
      right: state.right,
    });
  }

  private handleGlobalPointerMove(e: PointerEvent): void {
    const eventPointerId = e.pointerId !== undefined ? e.pointerId : null;

    if (eventPointerId !== null) {
      for (const tracker of this.joystickTrackers) {
        if (tracker.active && tracker.pointerId === eventPointerId) {
          this.updateJoystickFromEvent(tracker, e);
        }
      }
      return;
    }

    // Fallback for synthetic MouseEvents in jsdom where pointerId is undefined
    if (this.lastPressedJoystick && this.lastPressedJoystick.active) {
      this.updateJoystickFromEvent(this.lastPressedJoystick, e);
    }
  }

  private handleGlobalPointerUp(e: PointerEvent): void {
    const eventPointerId = e.pointerId !== undefined ? e.pointerId : null;

    for (const tracker of this.joystickTrackers) {
      if (!tracker.active) continue;
      if (eventPointerId === null || tracker.pointerId === eventPointerId) {
        this.resetJoystickTracker(tracker);
      }
    }
  }

  private resetJoystickTracker(tracker: ActiveJoystickTracker): void {
    tracker.active = false;
    tracker.pointerId = null;
    tracker.baseEl.classList.remove('is-active');
    tracker.knobEl.style.transform = 'translate3d(0px, 0px, 0)';
    this.inputManager.setVirtualDirection(tracker.playerId, {
      up: false,
      down: false,
      left: false,
      right: false,
    });
  }

  private releaseAllInputs(): void {
    for (const tracker of this.joystickTrackers) {
      if (tracker.active) {
        this.resetJoystickTracker(tracker);
      }
    }
    for (const btn of this.allInteractiveButtons) {
      btn.classList.remove('is-pressed');
    }
    this.inputManager.cancelVirtualInventoryPress(1);
    this.inputManager.cancelVirtualInventoryPress(2);
    this.lastPressedJoystick = null;
  }

  public destroy(): void {
    this.releaseAllInputs();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', this.boundPointerMove);
      window.removeEventListener('pointerup', this.boundPointerUp);
      window.removeEventListener('pointercancel', this.boundPointerUp);
      window.removeEventListener('resize', this.boundResize);
      window.removeEventListener('orientationchange', this.boundResize);
      window.removeEventListener('blur', this.boundBlur);
      window.removeEventListener('touchstart', this.boundFirstTouch);
      window.removeEventListener('pointerdown', this.boundFirstTouch);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundBlur);
    }
    this.rootEl.remove();
  }
}
