import {
  CommonKeyBindings,
  ControlSettings,
  DirectionalState,
  GamepadMenuAction,
  IInputManager,
  PingKind,
  PlayerId,
  PlayerInput,
  PlayerKeyBindings,
  PlayMode,
  VirtualAction,
  createDefaultPlayerInput,
} from '../shared/types';

export const STORAGE_KEY = 'shift_game_controls_v2';
export const GAMEPAD_STORAGE_KEY = 'shift_game_gamepad_controls_v1';
export const SINGLE_GAMEPAD_PLAYER_STORAGE_KEY =
  'shift_game_single_gamepad_player_v1';
export const INVENTORY_HOLD_DROP_MS = 1000;
export const GAMEPAD_STICK_DEADZONE = 0.25;
export const GAMEPAD_BUTTON_THRESHOLD = 0.5;
export const GAMEPAD_OCTANT_THRESHOLD = Math.sin(Math.PI / 8); // ~0.3826834

export function createDefaultControlSettings(): ControlSettings {
  return {
    p1: {
      Up: 'KeyW',
      Down: 'KeyS',
      Left: 'KeyA',
      Right: 'KeyD',
      UseItem: 'KeyQ',
      Interact: 'Digit1',
      Inventory: 'Digit2',
      Ping: 'KeyE',
    },
    p2: {
      Up: 'ArrowUp',
      Down: 'ArrowDown',
      Left: 'ArrowLeft',
      Right: 'ArrowRight',
      UseItem: 'Quote',
      Interact: 'BracketRight',
      Inventory: 'BracketLeft',
      Ping: 'Slash',
    },
    common: {
      SwitchDimensions: 'ShiftLeft',
      Pause: 'KeyP',
      Mute: 'KeyM',
    },
  };
}

export function createDefaultGamepadControlSettings(): ControlSettings {
  return {
    p1: {
      Up: 'GamepadButton12',
      Down: 'GamepadButton13',
      Left: 'GamepadButton14',
      Right: 'GamepadButton15',
      UseItem: 'GamepadButton2',
      Interact: 'GamepadButton0',
      Inventory: 'GamepadButton3',
      Ping: 'GamepadButton1',
    },
    p2: {
      Up: 'GamepadButton12',
      Down: 'GamepadButton13',
      Left: 'GamepadButton14',
      Right: 'GamepadButton15',
      UseItem: 'GamepadButton2',
      Interact: 'GamepadButton0',
      Inventory: 'GamepadButton3',
      Ping: 'GamepadButton1',
    },
    common: {
      SwitchDimensions: 'GamepadButton5',
      Pause: 'GamepadButton9',
      Mute: 'GamepadButton8',
    },
  };
}

const KEY_CODE_LABELS: Record<string, string> = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
  ControlLeft: 'CTRL',
  ControlRight: 'CTRL',
  AltLeft: 'ALT',
  AltRight: 'ALT',
  MetaLeft: 'META',
  MetaRight: 'META',
  Space: 'SPACE',
  Enter: 'ENTER',
  Escape: 'ESC',
  Backspace: 'BACKSPACE',
  Tab: 'TAB',
  CapsLock: 'CAPS',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Slash: '/',
  Semicolon: ';',
  Equal: '=',
  Comma: ',',
  Minus: '-',
  Period: '.',
  Backquote: '`',
  Delete: 'DEL',
  Insert: 'INS',
  Home: 'HOME',
  End: 'END',
  PageUp: 'PGUP',
  PageDown: 'PGDN',
  GamepadButton0: 'PAD A',
  GamepadButton1: 'PAD B',
  GamepadButton2: 'PAD X',
  GamepadButton3: 'PAD Y',
  GamepadButton4: 'PAD LB',
  GamepadButton5: 'PAD RB',
  GamepadButton6: 'PAD LT',
  GamepadButton7: 'PAD RT',
  GamepadButton8: 'PAD BACK',
  GamepadButton9: 'PAD START',
  GamepadButton10: 'PAD L3',
  GamepadButton11: 'PAD R3',
  GamepadButton12: 'DPAD UP',
  GamepadButton13: 'DPAD DOWN',
  GamepadButton14: 'DPAD LEFT',
  GamepadButton15: 'DPAD RIGHT',
};

export function formatKeyCode(code: string): string {
  if (!code) return '';
  if (KEY_CODE_LABELS[code]) {
    return KEY_CODE_LABELS[code];
  }
  const gpMatch = /^GamepadButton(\d+)$/i.exec(code);
  if (gpMatch) {
    return `PAD B${gpMatch[1]}`;
  }
  const keyMatch = /^Key([A-Z])$/.exec(code);
  if (keyMatch) {
    return keyMatch[1];
  }
  const digitMatch = /^Digit([0-9])$/.exec(code);
  if (digitMatch) {
    return digitMatch[1];
  }
  const numpadMatch = /^Numpad([0-9])$/.exec(code);
  if (numpadMatch) {
    return `NUM ${numpadMatch[1]}`;
  }
  return code.toUpperCase();
}

export function isGamepadButtonCode(code: string): boolean {
  return /^GamepadButton\d+$/i.test(code);
}

interface InventoryHoldTracker {
  activeCode: string | null;
  timerId: ReturnType<typeof setTimeout> | null;
  droppedOnHold: boolean;
}

export type GamepadProvider = () => ReadonlyArray<Gamepad | null | undefined>;

export interface InputManagerOptions {
  mode?: PlayMode;
  localPlayerId?: PlayerId;
  storage?: Storage | null;
  target?: EventTarget | null;
  gamepadProvider?: GamepadProvider | null;
  gamepadDeadzone?: number;
  singleGamepadPlayer?: PlayerId;
}

export class InputManager implements IInputManager {
  private settings: ControlSettings;
  private gamepadSettings: ControlSettings;
  private mode: PlayMode;
  private localPlayerId: PlayerId;
  private storage: Storage | null;
  private target: EventTarget | null;
  private gamepadProvider: GamepadProvider | null;
  private gamepadDeadzone: number;
  private singleGamepadPlayer: PlayerId;
  private enabled = true;

  private p1Input: PlayerInput = createDefaultPlayerInput();
  private p2Input: PlayerInput = createDefaultPlayerInput();

  private pressedCodes = new Set<string>();

  private virtualDirs: Record<PlayerId, DirectionalState> = {
    1: { up: false, down: false, left: false, right: false },
    2: { up: false, down: false, left: false, right: false },
  };

  private gamepadDirs: Record<PlayerId, DirectionalState> = {
    1: { up: false, down: false, left: false, right: false },
    2: { up: false, down: false, left: false, right: false },
  };

  private gamepadActive: Record<PlayerId, boolean> = {
    1: false,
    2: false,
  };

  private previousGamepadButtons = new Map<number, boolean[]>();
  private previousGamepadStickDirs = new Map<number, DirectionalState>();
  private lastConnectedGamepadCount = 0;

  private invHold: Record<PlayerId, InventoryHoldTracker> = {
    1: { activeCode: null, timerId: null, droppedOnHold: false },
    2: { activeCode: null, timerId: null, droppedOnHold: false },
  };

  private pauseListeners: Array<() => void> = [];
  private muteListeners: Array<() => void> = [];
  private bindingChangeListeners: Array<() => void> = [];
  private gamepadMenuActionListeners: Array<
    (action: GamepadMenuAction, gamepadIndex: number) => void
  > = [];
  private gamepadButtonDownListeners: Array<
    (buttonCode: string, gamepadIndex: number) => void
  > = [];
  private gamepadStatusListeners: Array<(connectedCount: number) => void> = [];

  private readonly boundKeyDown: (e: Event) => void;
  private readonly boundKeyUp: (e: Event) => void;
  private readonly boundBlur: () => void;
  private readonly boundGamepadChange: () => void;

  constructor(options: InputManagerOptions = {}) {
    this.mode = options.mode ?? 'local';
    this.localPlayerId = options.localPlayerId ?? 1;
    this.storage =
      options.storage !== undefined
        ? options.storage
        : typeof localStorage !== 'undefined'
        ? localStorage
        : null;
    this.target =
      options.target !== undefined
        ? options.target
        : typeof window !== 'undefined'
        ? window
        : null;
    this.gamepadProvider =
      options.gamepadProvider !== undefined
        ? options.gamepadProvider
        : typeof navigator !== 'undefined' &&
          typeof navigator.getGamepads === 'function'
        ? () => navigator.getGamepads()
        : null;
    this.gamepadDeadzone =
      options.gamepadDeadzone !== undefined
        ? options.gamepadDeadzone
        : GAMEPAD_STICK_DEADZONE;
    this.singleGamepadPlayer =
      options.singleGamepadPlayer ?? this.loadSingleGamepadPlayer();

    this.settings = this.loadSettings();
    this.gamepadSettings = this.loadGamepadSettings();

    this.boundKeyDown = (e: Event) => this.handleKeyDown(e as KeyboardEvent);
    this.boundKeyUp = (e: Event) => this.handleKeyUp(e as KeyboardEvent);
    this.boundBlur = () => this.clearHeldState();
    this.boundGamepadChange = () => {
      const count = this.getConnectedGamepadCount();
      if (count !== this.lastConnectedGamepadCount) {
        this.lastConnectedGamepadCount = count;
        this.gamepadStatusListeners.forEach((cb) => cb(count));
        this.bindingChangeListeners.forEach((cb) => cb());
      }
    };

    if (this.target) {
      this.target.addEventListener('keydown', this.boundKeyDown);
      this.target.addEventListener('keyup', this.boundKeyUp);
      this.target.addEventListener('blur', this.boundBlur);
      this.target.addEventListener('gamepadconnected', this.boundGamepadChange);
      this.target.addEventListener(
        'gamepaddisconnected',
        this.boundGamepadChange
      );
    }
  }

  private loadSingleGamepadPlayer(): PlayerId {
    if (!this.storage) return 1;
    try {
      const raw = this.storage.getItem(SINGLE_GAMEPAD_PLAYER_STORAGE_KEY);
      if (raw === '2') return 2;
      return 1;
    } catch {
      return 1;
    }
  }

  private saveSingleGamepadPlayer(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(
        SINGLE_GAMEPAD_PLAYER_STORAGE_KEY,
        String(this.singleGamepadPlayer)
      );
    } catch {
      // Ignore storage errors
    }
  }

  public getSingleGamepadPlayer(): PlayerId {
    return this.singleGamepadPlayer;
  }

  public setSingleGamepadPlayer(playerId: PlayerId): void {
    const safePlayerId: PlayerId = playerId === 2 ? 2 : 1;
    this.singleGamepadPlayer = safePlayerId;
    this.saveSingleGamepadPlayer();
    this.cancelAllInventoryHolds();
    this.gamepadDirs[1] = { up: false, down: false, left: false, right: false };
    this.gamepadDirs[2] = { up: false, down: false, left: false, right: false };
    this.recomputeDirectionalHoldStates();
    this.bindingChangeListeners.forEach((cb) => cb());
  }

  private cancelAllInventoryHolds(): void {
    for (const pid of [1, 2] as PlayerId[]) {
      const tracker = this.invHold[pid];
      if (tracker.timerId !== null) {
        clearTimeout(tracker.timerId);
        tracker.timerId = null;
      }
      tracker.activeCode = null;
      tracker.droppedOnHold = false;
    }
  }

  private loadSettings(): ControlSettings {
    const defaults = createDefaultControlSettings();
    if (!this.storage) {
      return defaults;
    }
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<ControlSettings>;
      return {
        p1: { ...defaults.p1, ...(parsed.p1 ?? {}) },
        p2: { ...defaults.p2, ...(parsed.p2 ?? {}) },
        common: { ...defaults.common, ...(parsed.common ?? {}) },
      };
    } catch {
      return defaults;
    }
  }

  private saveSettings(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore quota / storage errors
    }
  }

  private loadGamepadSettings(): ControlSettings {
    const defaults = createDefaultGamepadControlSettings();
    if (!this.storage) {
      return defaults;
    }
    try {
      const raw = this.storage.getItem(GAMEPAD_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<ControlSettings>;
      return {
        p1: { ...defaults.p1, ...(parsed.p1 ?? {}) },
        p2: { ...defaults.p2, ...(parsed.p2 ?? {}) },
        common: { ...defaults.common, ...(parsed.common ?? {}) },
      };
    } catch {
      return defaults;
    }
  }

  private saveGamepadSettings(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(
        GAMEPAD_STORAGE_KEY,
        JSON.stringify(this.gamepadSettings)
      );
    } catch {
      // Ignore quota / storage errors
    }
  }

  public setPlayMode(mode: PlayMode, localPlayerId?: PlayerId): void {
    this.mode = mode;
    if (localPlayerId !== undefined) {
      this.localPlayerId = localPlayerId;
    }
    this.recomputeDirectionalHoldStates();
  }

  public getPlayMode(): PlayMode {
    return this.mode;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearHeldState();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private matchesBinding(code: string, boundCode: string): boolean {
    if (code === boundCode) return true;
    if (
      (boundCode === 'ShiftLeft' || boundCode === 'ShiftRight') &&
      (code === 'ShiftLeft' || code === 'ShiftRight')
    ) {
      return true;
    }
    return false;
  }

  private isCodeAssignedAnywhere(code: string): boolean {
    const { p1, p2, common } = this.settings;
    return (
      Object.values(p1).includes(code) ||
      Object.values(p2).includes(code) ||
      Object.values(common).includes(code)
    );
  }

  private matchesActionForGroup(
    code: string,
    bindings: PlayerKeyBindings,
    action: keyof PlayerKeyBindings,
    isP1Group: boolean
  ): boolean {
    if (this.matchesBinding(code, bindings[action])) {
      return true;
    }
    // Also support KeyF as a secondary Ping key for P1 if KeyF is not custom-bound elsewhere
    if (
      isP1Group &&
      action === 'Ping' &&
      code === 'KeyF' &&
      !this.isCodeAssignedAnywhere('KeyF')
    ) {
      return true;
    }
    return false;
  }

  private recomputeDirectionalHoldStates(): void {
    const checkDown = (bound: string) => {
      if (bound === 'ShiftLeft' || bound === 'ShiftRight') {
        return (
          this.pressedCodes.has('ShiftLeft') ||
          this.pressedCodes.has('ShiftRight')
        );
      }
      return this.pressedCodes.has(bound);
    };

    const p1Up =
      checkDown(this.settings.p1.Up) ||
      this.virtualDirs[1].up ||
      this.gamepadDirs[1].up;
    const p1Down =
      checkDown(this.settings.p1.Down) ||
      this.virtualDirs[1].down ||
      this.gamepadDirs[1].down;
    const p1Left =
      checkDown(this.settings.p1.Left) ||
      this.virtualDirs[1].left ||
      this.gamepadDirs[1].left;
    const p1Right =
      checkDown(this.settings.p1.Right) ||
      this.virtualDirs[1].right ||
      this.gamepadDirs[1].right;

    const p2Up =
      checkDown(this.settings.p2.Up) ||
      this.virtualDirs[2].up ||
      this.gamepadDirs[2].up;
    const p2Down =
      checkDown(this.settings.p2.Down) ||
      this.virtualDirs[2].down ||
      this.gamepadDirs[2].down;
    const p2Left =
      checkDown(this.settings.p2.Left) ||
      this.virtualDirs[2].left ||
      this.gamepadDirs[2].left;
    const p2Right =
      checkDown(this.settings.p2.Right) ||
      this.virtualDirs[2].right ||
      this.gamepadDirs[2].right;

    if (this.mode === 'online') {
      // In Online Mode, allow the local player (whether P1 Host or P2 Client)
      // to use either WASD, Arrow keys, or any connected Gamepad comfortably on their own computer.
      const combinedUp = p1Up || p2Up;
      const combinedDown = p1Down || p2Down;
      const combinedLeft = p1Left || p2Left;
      const combinedRight = p1Right || p2Right;

      this.p1Input.up = combinedUp;
      this.p1Input.down = combinedDown;
      this.p1Input.left = combinedLeft;
      this.p1Input.right = combinedRight;

      this.p2Input.up = combinedUp;
      this.p2Input.down = combinedDown;
      this.p2Input.left = combinedLeft;
      this.p2Input.right = combinedRight;
    } else {
      this.p1Input.up = p1Up;
      this.p1Input.down = p1Down;
      this.p1Input.left = p1Left;
      this.p1Input.right = p1Right;

      this.p2Input.up = p2Up;
      this.p2Input.down = p2Down;
      this.p2Input.left = p2Left;
      this.p2Input.right = p2Right;
    }
  }

  private startInventoryHold(playerId: PlayerId, code: string): void {
    const tracker = this.invHold[playerId];
    if (tracker.timerId !== null) {
      clearTimeout(tracker.timerId);
    }
    tracker.activeCode = code;
    tracker.droppedOnHold = false;
    tracker.timerId = setTimeout(() => {
      tracker.timerId = null;
      tracker.droppedOnHold = true;
      const targetInput = playerId === 1 ? this.p1Input : this.p2Input;
      targetInput.inventoryDropSeq++;
    }, INVENTORY_HOLD_DROP_MS);
  }

  private endInventoryHold(playerId: PlayerId): void {
    const tracker = this.invHold[playerId];
    if (tracker.timerId !== null) {
      clearTimeout(tracker.timerId);
      tracker.timerId = null;
    }
    if (!tracker.droppedOnHold && tracker.activeCode !== null) {
      const targetInput = playerId === 1 ? this.p1Input : this.p2Input;
      targetInput.inventoryCycleSeq++;
    }
    tracker.activeCode = null;
    tracker.droppedOnHold = false;
  }

  private triggerDiscreteActionsForPlayer(
    playerId: PlayerId,
    code: string,
    bindings: PlayerKeyBindings,
    isP1Group: boolean
  ): void {
    const targetInput = playerId === 1 ? this.p1Input : this.p2Input;

    if (this.matchesActionForGroup(code, bindings, 'UseItem', isP1Group)) {
      targetInput.useItemSeq++;
    }
    if (this.matchesActionForGroup(code, bindings, 'Interact', isP1Group)) {
      targetInput.interactSeq++;
    }
    if (this.matchesActionForGroup(code, bindings, 'Inventory', isP1Group)) {
      this.startInventoryHold(playerId, code);
    }
    if (this.matchesActionForGroup(code, bindings, 'Ping', isP1Group)) {
      targetInput.pingSeq++;
      const kinds: PingKind[] = ['here', 'action', 'wait'];
      targetInput.pingKind = kinds[(targetInput.pingSeq - 1) % kinds.length];
    }
  }

  private setPlayerGamepadActive(playerId: PlayerId, active: boolean): void {
    if (this.gamepadActive[playerId] !== active) {
      this.gamepadActive[playerId] = active;
      this.bindingChangeListeners.forEach((cb) => cb());
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    const code = e.code;
    if (!code) return;

    const isP1Key =
      Object.values(this.settings.p1).some((b) => this.matchesBinding(code, b)) ||
      (code === 'KeyF' && !this.isCodeAssignedAnywhere('KeyF'));
    const isP2Key = Object.values(this.settings.p2).some((b) =>
      this.matchesBinding(code, b)
    );
    if (this.mode === 'online' && (isP1Key || isP2Key)) {
      this.setPlayerGamepadActive(1, false);
      this.setPlayerGamepadActive(2, false);
    } else {
      if (isP1Key) this.setPlayerGamepadActive(1, false);
      if (isP2Key) this.setPlayerGamepadActive(2, false);
    }

    const alreadyPressed = this.pressedCodes.has(code);
    this.pressedCodes.add(code);
    this.recomputeDirectionalHoldStates();

    if (e.repeat || alreadyPressed) {
      return;
    }

    // Common keys
    if (this.matchesBinding(code, this.settings.common.SwitchDimensions)) {
      if (this.mode === 'online') {
        if (this.localPlayerId === 1) {
          this.p1Input.shiftRequestSeq++;
        } else {
          this.p2Input.shiftRequestSeq++;
        }
      } else {
        this.p1Input.shiftRequestSeq++;
        this.p2Input.shiftRequestSeq++;
      }
    }
    if (this.matchesBinding(code, this.settings.common.Pause)) {
      this.pauseListeners.forEach((cb) => cb());
    }
    if (this.matchesBinding(code, this.settings.common.Mute)) {
      this.muteListeners.forEach((cb) => cb());
    }

    if (this.mode === 'online') {
      // In Online Mode, both P1 and P2 key sets trigger discrete actions for the local player
      // (deduplicated per action so shared bindings only increment once per keydown)
      for (const pid of [1, 2] as PlayerId[]) {
        const targetInput = pid === 1 ? this.p1Input : this.p2Input;
        if (
          this.matchesActionForGroup(code, this.settings.p1, 'UseItem', true) ||
          this.matchesActionForGroup(code, this.settings.p2, 'UseItem', false)
        ) {
          targetInput.useItemSeq++;
        }
        if (
          this.matchesActionForGroup(code, this.settings.p1, 'Interact', true) ||
          this.matchesActionForGroup(code, this.settings.p2, 'Interact', false)
        ) {
          targetInput.interactSeq++;
        }
        if (
          this.matchesActionForGroup(code, this.settings.p1, 'Inventory', true) ||
          this.matchesActionForGroup(code, this.settings.p2, 'Inventory', false)
        ) {
          this.startInventoryHold(pid, code);
        }
        if (
          this.matchesActionForGroup(code, this.settings.p1, 'Ping', true) ||
          this.matchesActionForGroup(code, this.settings.p2, 'Ping', false)
        ) {
          targetInput.pingSeq++;
          const kinds: PingKind[] = ['here', 'action', 'wait'];
          targetInput.pingKind =
            kinds[(targetInput.pingSeq - 1) % kinds.length];
        }
      }
    } else {
      this.triggerDiscreteActionsForPlayer(1, code, this.settings.p1, true);
      this.triggerDiscreteActionsForPlayer(2, code, this.settings.p2, false);
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (!this.enabled) return;
    const code = e.code;
    if (!code) return;

    this.pressedCodes.delete(code);
    this.recomputeDirectionalHoldStates();

    if (this.mode === 'online') {
      if (
        this.matchesActionForGroup(code, this.settings.p1, 'Inventory', true) ||
        this.matchesActionForGroup(code, this.settings.p2, 'Inventory', false)
      ) {
        this.endInventoryHold(1);
        this.endInventoryHold(2);
      }
    } else {
      if (
        this.matchesActionForGroup(code, this.settings.p1, 'Inventory', true)
      ) {
        this.endInventoryHold(1);
      }
      if (
        this.matchesActionForGroup(code, this.settings.p2, 'Inventory', false)
      ) {
        this.endInventoryHold(2);
      }
    }
  }

  private clearHeldState(): void {
    this.pressedCodes.clear();
    this.virtualDirs[1] = { up: false, down: false, left: false, right: false };
    this.virtualDirs[2] = { up: false, down: false, left: false, right: false };
    this.gamepadDirs[1] = { up: false, down: false, left: false, right: false };
    this.gamepadDirs[2] = { up: false, down: false, left: false, right: false };
    this.recomputeDirectionalHoldStates();
    for (const pid of [1, 2] as PlayerId[]) {
      const tracker = this.invHold[pid];
      if (tracker.timerId !== null) {
        clearTimeout(tracker.timerId);
        tracker.timerId = null;
      }
      tracker.activeCode = null;
      tracker.droppedOnHold = false;
    }
  }

  private readActiveGamepads(): Gamepad[] {
    const provider =
      this.gamepadProvider ??
      (typeof navigator !== 'undefined' &&
      typeof navigator.getGamepads === 'function'
        ? () => navigator.getGamepads()
        : null);
    if (!provider) return [];
    try {
      const raw = provider();
      if (!raw) return [];
      const active: Gamepad[] = [];
      for (let i = 0; i < raw.length; i++) {
        const gp = raw[i];
        if (gp && gp.connected !== false) {
          active.push(gp);
        }
      }
      active.sort((a, b) => a.index - b.index);
      return active;
    } catch {
      return [];
    }
  }

  public getConnectedGamepadCount(): number {
    return this.readActiveGamepads().length;
  }

  public isGamepadActiveForPlayer(playerId: PlayerId): boolean {
    return this.gamepadActive[playerId];
  }

  private computeStickDirection(axes: readonly number[] | undefined): DirectionalState {
    const ax = axes && axes.length > 0 ? axes[0] ?? 0 : 0;
    const ay = axes && axes.length > 1 ? axes[1] ?? 0 : 0;
    const dist = Math.hypot(ax, ay);
    if (dist < this.gamepadDeadzone || dist === 0) {
      return { up: false, down: false, left: false, right: false };
    }
    const ux = ax / dist;
    const uy = ay / dist;
    return {
      up: uy < -GAMEPAD_OCTANT_THRESHOLD,
      down: uy > GAMEPAD_OCTANT_THRESHOLD,
      left: ux < -GAMEPAD_OCTANT_THRESHOLD,
      right: ux > GAMEPAD_OCTANT_THRESHOLD,
    };
  }

  private isGamepadButtonPressed(
    buttons: ReadonlyArray<GamepadButton | { pressed: boolean; value: number }> | undefined,
    index: number
  ): boolean {
    if (!buttons || index < 0 || index >= buttons.length) return false;
    const btn = buttons[index];
    if (!btn) return false;
    return Boolean(
      btn.pressed ||
        (typeof btn.value === 'number' && btn.value >= GAMEPAD_BUTTON_THRESHOLD)
    );
  }

  private isGamepadButtonCustomBoundInGroup(
    btnCode: string,
    keyBindings: PlayerKeyBindings,
    gpBindings: PlayerKeyBindings
  ): boolean {
    return (
      Object.values(keyBindings).includes(btnCode) ||
      Object.values(gpBindings).includes(btnCode) ||
      Object.values(this.gamepadSettings.common).includes(btnCode) ||
      Object.values(this.settings.common).includes(btnCode)
    );
  }

  private matchesGamepadActionForGroup(
    btnIdx: number,
    btnCode: string,
    keyBindings: PlayerKeyBindings,
    gpBindings: PlayerKeyBindings,
    action: keyof PlayerKeyBindings
  ): boolean {
    if (gpBindings[action] === btnCode || keyBindings[action] === btnCode) {
      return true;
    }
    // If this button is bound to another action in this group or common settings, do not trigger secondary default
    if (
      this.isGamepadButtonCustomBoundInGroup(btnCode, keyBindings, gpBindings)
    ) {
      return false;
    }
    // Secondary ergonomic shoulder/trigger/stick defaults when not reassigned elsewhere
    switch (action) {
      case 'UseItem':
        return btnIdx === 7 && gpBindings.UseItem === 'GamepadButton2'; // RT / R2
      case 'Inventory':
        return btnIdx === 4 && gpBindings.Inventory === 'GamepadButton3'; // LB / L1
      case 'Ping':
        return btnIdx === 11 && gpBindings.Ping === 'GamepadButton1'; // R3
      default:
        return false;
    }
  }

  private getOnlineGamepadBindings(): PlayerKeyBindings {
    if (this.localPlayerId === 2) {
      const defaults = createDefaultGamepadControlSettings().p2;
      const p2Custom = (
        Object.keys(defaults) as Array<keyof PlayerKeyBindings>
      ).some((k) => this.gamepadSettings.p2[k] !== defaults[k]);
      if (p2Custom) {
        return this.gamepadSettings.p2;
      }
    }
    return this.gamepadSettings.p1;
  }

  public pollGamepads(): void {
    const pads = this.readActiveGamepads();
    if (pads.length !== this.lastConnectedGamepadCount) {
      this.lastConnectedGamepadCount = pads.length;
      this.gamepadStatusListeners.forEach((cb) => cb(pads.length));
      this.bindingChangeListeners.forEach((cb) => cb());
    }

    const activePadIndices = new Set<number>();
    const nextDirs: Record<PlayerId, DirectionalState> = {
      1: { up: false, down: false, left: false, right: false },
      2: { up: false, down: false, left: false, right: false },
    };

    for (let listIdx = 0; listIdx < pads.length; listIdx++) {
      const gp = pads[listIdx];
      activePadIndices.add(gp.index);

      const targetPlayerId: PlayerId =
        this.mode === 'online'
          ? this.localPlayerId
          : pads.length === 1
          ? this.singleGamepadPlayer
          : listIdx % 2 === 0
          ? 1
          : 2;

      const targetBindings =
        targetPlayerId === 1 ? this.settings.p1 : this.settings.p2;
      const targetGpBindings =
        this.mode === 'online'
          ? this.getOnlineGamepadBindings()
          : targetPlayerId === 1
          ? this.gamepadSettings.p1
          : this.gamepadSettings.p2;

      const stickDir = this.computeStickDirection(gp.axes);
      const prevStickDir = this.previousGamepadStickDirs.get(gp.index) ?? {
        up: false,
        down: false,
        left: false,
        right: false,
      };
      this.previousGamepadStickDirs.set(gp.index, stickDir);

      const buttonCount = Math.max(16, gp.buttons?.length ?? 0);
      const prevButtons =
        this.previousGamepadButtons.get(gp.index) ??
        Array.from({ length: buttonCount }, () => false);
      const currentButtons: boolean[] = [];
      for (let b = 0; b < buttonCount; b++) {
        currentButtons[b] = this.isGamepadButtonPressed(gp.buttons, b);
      }
      this.previousGamepadButtons.set(gp.index, currentButtons);

      // Compute combined stick + D-Pad directional state for this pad
      const padUp =
        stickDir.up ||
        currentButtons.some(
          (pressed, bIdx) =>
            pressed &&
            this.matchesGamepadActionForGroup(
              bIdx,
              `GamepadButton${bIdx}`,
              targetBindings,
              targetGpBindings,
              'Up'
            )
        );
      const padDown =
        stickDir.down ||
        currentButtons.some(
          (pressed, bIdx) =>
            pressed &&
            this.matchesGamepadActionForGroup(
              bIdx,
              `GamepadButton${bIdx}`,
              targetBindings,
              targetGpBindings,
              'Down'
            )
        );
      const padLeft =
        stickDir.left ||
        currentButtons.some(
          (pressed, bIdx) =>
            pressed &&
            this.matchesGamepadActionForGroup(
              bIdx,
              `GamepadButton${bIdx}`,
              targetBindings,
              targetGpBindings,
              'Left'
            )
        );
      const padRight =
        stickDir.right ||
        currentButtons.some(
          (pressed, bIdx) =>
            pressed &&
            this.matchesGamepadActionForGroup(
              bIdx,
              `GamepadButton${bIdx}`,
              targetBindings,
              targetGpBindings,
              'Right'
            )
        );

      const anyInputOnPad =
        padUp ||
        padDown ||
        padLeft ||
        padRight ||
        currentButtons.some(Boolean);

      if (anyInputOnPad) {
        if (this.mode === 'online') {
          this.setPlayerGamepadActive(1, true);
          this.setPlayerGamepadActive(2, true);
        } else {
          this.setPlayerGamepadActive(targetPlayerId, true);
        }
      }

      if (this.mode === 'online') {
        nextDirs[1].up = nextDirs[1].up || padUp;
        nextDirs[1].down = nextDirs[1].down || padDown;
        nextDirs[1].left = nextDirs[1].left || padLeft;
        nextDirs[1].right = nextDirs[1].right || padRight;
        nextDirs[2].up = nextDirs[2].up || padUp;
        nextDirs[2].down = nextDirs[2].down || padDown;
        nextDirs[2].left = nextDirs[2].left || padLeft;
        nextDirs[2].right = nextDirs[2].right || padRight;
      } else {
        nextDirs[targetPlayerId].up = nextDirs[targetPlayerId].up || padUp;
        nextDirs[targetPlayerId].down =
          nextDirs[targetPlayerId].down || padDown;
        nextDirs[targetPlayerId].left =
          nextDirs[targetPlayerId].left || padLeft;
        nextDirs[targetPlayerId].right =
          nextDirs[targetPlayerId].right || padRight;
      }

      // Emit menu navigation actions on stick rising edges
      if (!prevStickDir.up && stickDir.up) {
        this.gamepadMenuActionListeners.forEach((cb) => cb('up', gp.index));
      }
      if (!prevStickDir.down && stickDir.down) {
        this.gamepadMenuActionListeners.forEach((cb) => cb('down', gp.index));
      }
      if (!prevStickDir.left && stickDir.left) {
        this.gamepadMenuActionListeners.forEach((cb) => cb('left', gp.index));
      }
      if (!prevStickDir.right && stickDir.right) {
        this.gamepadMenuActionListeners.forEach((cb) => cb('right', gp.index));
      }

      // Process button rising and falling edges
      for (let bIdx = 0; bIdx < buttonCount; bIdx++) {
        const wasPressed = Boolean(prevButtons[bIdx]);
        const isPressed = Boolean(currentButtons[bIdx]);
        const btnCode = `GamepadButton${bIdx}`;

        if (!wasPressed && isPressed) {
          this.gamepadButtonDownListeners.forEach((cb) =>
            cb(btnCode, gp.index)
          );

          if (bIdx === 12) {
            this.gamepadMenuActionListeners.forEach((cb) => cb('up', gp.index));
          } else if (bIdx === 13) {
            this.gamepadMenuActionListeners.forEach((cb) =>
              cb('down', gp.index)
            );
          } else if (bIdx === 14) {
            this.gamepadMenuActionListeners.forEach((cb) =>
              cb('left', gp.index)
            );
          } else if (bIdx === 15) {
            this.gamepadMenuActionListeners.forEach((cb) =>
              cb('right', gp.index)
            );
          } else if (bIdx === 0 || bIdx === 9) {
            this.gamepadMenuActionListeners.forEach((cb) =>
              cb('confirm', gp.index)
            );
          } else if (bIdx === 1 || bIdx === 8) {
            this.gamepadMenuActionListeners.forEach((cb) =>
              cb('cancel', gp.index)
            );
          }

          if (this.enabled) {
            // Common actions: Pause, Mute, SwitchDimensions
            const isPauseMatch =
              this.gamepadSettings.common.Pause === btnCode ||
              this.settings.common.Pause === btnCode;
            if (isPauseMatch) {
              this.pauseListeners.forEach((cb) => cb());
            }

            const isMuteMatch =
              this.gamepadSettings.common.Mute === btnCode ||
              this.settings.common.Mute === btnCode;
            if (isMuteMatch) {
              this.muteListeners.forEach((cb) => cb());
            }

            const isShiftMatch =
              this.gamepadSettings.common.SwitchDimensions === btnCode ||
              this.settings.common.SwitchDimensions === btnCode ||
              (bIdx === 6 &&
                this.gamepadSettings.common.SwitchDimensions ===
                  'GamepadButton5' &&
                !this.isGamepadButtonCustomBoundInGroup(
                  btnCode,
                  targetBindings,
                  targetGpBindings
                ));
            if (isShiftMatch) {
              const shiftPid =
                this.mode === 'online' ? this.localPlayerId : targetPlayerId;
              if (shiftPid === 1) {
                this.p1Input.shiftRequestSeq++;
              } else {
                this.p2Input.shiftRequestSeq++;
              }
            }

            const playerPids: PlayerId[] =
              this.mode === 'online' ? [1, 2] : [targetPlayerId];

            for (const pid of playerPids) {
              const groupBindings =
                pid === 1 ? this.settings.p1 : this.settings.p2;
              const groupGpBindings =
                this.mode === 'online'
                  ? targetGpBindings
                  : pid === 1
                  ? this.gamepadSettings.p1
                  : this.gamepadSettings.p2;
              const targetInput = pid === 1 ? this.p1Input : this.p2Input;

              const matchesAction = (act: keyof PlayerKeyBindings) =>
                this.matchesGamepadActionForGroup(
                  bIdx,
                  btnCode,
                  groupBindings,
                  groupGpBindings,
                  act
                );

              if (matchesAction('UseItem')) {
                targetInput.useItemSeq++;
              }
              if (matchesAction('Interact')) {
                targetInput.interactSeq++;
              }
              if (matchesAction('Inventory')) {
                this.startInventoryHold(pid, btnCode);
              }
              if (matchesAction('Ping')) {
                targetInput.pingSeq++;
                const kinds: PingKind[] = ['here', 'action', 'wait'];
                targetInput.pingKind =
                  kinds[(targetInput.pingSeq - 1) % kinds.length];
              }
            }
          }
        } else if (wasPressed && !isPressed && this.enabled) {
          const playerPids: PlayerId[] =
            this.mode === 'online' ? [1, 2] : [targetPlayerId];
          for (const pid of playerPids) {
            if (this.invHold[pid].activeCode === btnCode) {
              this.endInventoryHold(pid);
            }
          }
        }
      }
    }

    // Prune disconnected gamepads from previous state maps and cancel any pending gamepad inventory holds
    for (const key of this.previousGamepadButtons.keys()) {
      if (!activePadIndices.has(key)) {
        this.previousGamepadButtons.delete(key);
        this.previousGamepadStickDirs.delete(key);
        for (const pid of [1, 2] as PlayerId[]) {
          const tracker = this.invHold[pid];
          if (tracker.activeCode && isGamepadButtonCode(tracker.activeCode)) {
            if (tracker.timerId !== null) {
              clearTimeout(tracker.timerId);
              tracker.timerId = null;
            }
            tracker.activeCode = null;
            tracker.droppedOnHold = false;
          }
        }
      }
    }

    if (this.enabled) {
      this.gamepadDirs[1] = nextDirs[1];
      this.gamepadDirs[2] = nextDirs[2];
      this.recomputeDirectionalHoldStates();
    }
  }

  public triggerVibration(
    playerId: PlayerId,
    durationMs: number = 120,
    strongMagnitude: number = 0.5,
    weakMagnitude: number = 0.5
  ): void {
    const pads = this.readActiveGamepads();
    if (pads.length === 0) return;
    let targetPad: Gamepad | undefined;
    if (this.mode === 'online') {
      if (playerId !== this.localPlayerId) return;
      targetPad = pads[0];
    } else if (pads.length === 1) {
      if (playerId !== this.singleGamepadPlayer) return;
      targetPad = pads[0];
    } else {
      targetPad = pads[playerId === 1 ? 0 : 1];
    }
    if (!targetPad) return;
    const actuator = (
      targetPad as Gamepad & {
        vibrationActuator?: {
          playEffect?: (
            type: string,
            params: {
              startDelay?: number;
              duration: number;
              weakMagnitude: number;
              strongMagnitude: number;
            }
          ) => unknown;
        } | null;
      }
    ).vibrationActuator;
    if (actuator && typeof actuator.playEffect === 'function') {
      try {
        void actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude,
          strongMagnitude,
        });
      } catch {
        // Ignore unsupported vibration errors
      }
    }
  }

  public setVirtualDirection(
    playerId: PlayerId,
    dir: Partial<DirectionalState>
  ): void {
    if (!this.enabled) return;
    this.virtualDirs[playerId] = {
      ...this.virtualDirs[playerId],
      ...dir,
    };
    this.recomputeDirectionalHoldStates();
  }

  public triggerVirtualAction(playerId: PlayerId, action: VirtualAction): void {
    if (!this.enabled) return;

    if (action === 'shift') {
      const shiftPlayerId =
        this.mode === 'online' ? this.localPlayerId : playerId;
      if (shiftPlayerId === 1) {
        this.p1Input.shiftRequestSeq++;
      } else {
        this.p2Input.shiftRequestSeq++;
      }
      return;
    }

    const targets: PlayerInput[] =
      this.mode === 'online'
        ? [this.p1Input, this.p2Input]
        : [playerId === 1 ? this.p1Input : this.p2Input];

    for (const targetInput of targets) {
      if (action === 'useItem') {
        targetInput.useItemSeq++;
      } else if (action === 'interact') {
        targetInput.interactSeq++;
      } else if (action === 'inventoryTap') {
        targetInput.inventoryCycleSeq++;
      } else if (action === 'inventoryDrop') {
        targetInput.inventoryDropSeq++;
      } else if (action === 'ping') {
        targetInput.pingSeq++;
        const kinds: PingKind[] = ['here', 'action', 'wait'];
        targetInput.pingKind = kinds[(targetInput.pingSeq - 1) % kinds.length];
      }
    }
  }

  public startVirtualInventoryPress(playerId: PlayerId): void {
    if (!this.enabled) return;
    if (this.mode === 'online') {
      this.startInventoryHold(1, 'VirtualInventory');
      this.startInventoryHold(2, 'VirtualInventory');
    } else {
      this.startInventoryHold(playerId, 'VirtualInventory');
    }
  }

  public endVirtualInventoryPress(playerId: PlayerId): void {
    if (!this.enabled) return;
    if (this.mode === 'online') {
      this.endInventoryHold(1);
      this.endInventoryHold(2);
    } else {
      this.endInventoryHold(playerId);
    }
  }

  public cancelVirtualInventoryPress(playerId: PlayerId): void {
    const pids: PlayerId[] = this.mode === 'online' ? [1, 2] : [playerId];
    for (const pid of pids) {
      const tracker = this.invHold[pid];
      if (tracker.timerId !== null) {
        clearTimeout(tracker.timerId);
        tracker.timerId = null;
      }
      tracker.activeCode = null;
      tracker.droppedOnHold = false;
    }
  }

  public triggerPause(): void {
    if (!this.enabled) return;
    this.pauseListeners.forEach((cb) => cb());
  }

  public triggerMute(): void {
    if (!this.enabled) return;
    this.muteListeners.forEach((cb) => cb());
  }

  public getPlayerInput(playerId: PlayerId): PlayerInput {
    this.pollGamepads();
    const src = playerId === 1 ? this.p1Input : this.p2Input;
    return { ...src };
  }

  public getSettings(): ControlSettings {
    return {
      p1: { ...this.settings.p1 },
      p2: { ...this.settings.p2 },
      common: { ...this.settings.common },
    };
  }

  public getGamepadSettings(): ControlSettings {
    return {
      p1: { ...this.gamepadSettings.p1 },
      p2: { ...this.gamepadSettings.p2 },
      common: { ...this.gamepadSettings.common },
    };
  }

  public updateBinding(
    group: 'p1' | 'p2' | 'common',
    action: string,
    code: string
  ): void {
    this.cancelAllInventoryHolds();
    if (group === 'p1' && action in this.settings.p1) {
      this.settings.p1[action as keyof PlayerKeyBindings] = code;
    } else if (group === 'p2' && action in this.settings.p2) {
      this.settings.p2[action as keyof PlayerKeyBindings] = code;
    } else if (group === 'common' && action in this.settings.common) {
      this.settings.common[action as keyof CommonKeyBindings] = code;
    }
    this.saveSettings();
    if (isGamepadButtonCode(code)) {
      this.applyGamepadBindingWithSwap(group, action, code);
      this.saveGamepadSettings();
    }
    this.recomputeDirectionalHoldStates();
    this.bindingChangeListeners.forEach((cb) => cb());
  }

  private applyGamepadBindingWithSwap(
    group: 'p1' | 'p2' | 'common',
    action: string,
    code: string
  ): void {
    if (group === 'p1' && action in this.gamepadSettings.p1) {
      const key = action as keyof PlayerKeyBindings;
      const prevCode = this.gamepadSettings.p1[key];
      for (const k of Object.keys(this.gamepadSettings.p1) as Array<
        keyof PlayerKeyBindings
      >) {
        if (k !== key && this.gamepadSettings.p1[k] === code) {
          this.gamepadSettings.p1[k] = prevCode;
        }
      }
      for (const ck of Object.keys(this.gamepadSettings.common) as Array<
        keyof CommonKeyBindings
      >) {
        if (this.gamepadSettings.common[ck] === code) {
          this.gamepadSettings.common[ck] = prevCode;
        }
      }
      this.gamepadSettings.p1[key] = code;
    } else if (group === 'p2' && action in this.gamepadSettings.p2) {
      const key = action as keyof PlayerKeyBindings;
      const prevCode = this.gamepadSettings.p2[key];
      for (const k of Object.keys(this.gamepadSettings.p2) as Array<
        keyof PlayerKeyBindings
      >) {
        if (k !== key && this.gamepadSettings.p2[k] === code) {
          this.gamepadSettings.p2[k] = prevCode;
        }
      }
      for (const ck of Object.keys(this.gamepadSettings.common) as Array<
        keyof CommonKeyBindings
      >) {
        if (this.gamepadSettings.common[ck] === code) {
          this.gamepadSettings.common[ck] = prevCode;
        }
      }
      this.gamepadSettings.p2[key] = code;
    } else if (group === 'common' && action in this.gamepadSettings.common) {
      const key = action as keyof CommonKeyBindings;
      const prevCode = this.gamepadSettings.common[key];
      for (const k of Object.keys(this.gamepadSettings.common) as Array<
        keyof CommonKeyBindings
      >) {
        if (k !== key && this.gamepadSettings.common[k] === code) {
          this.gamepadSettings.common[k] = prevCode;
        }
      }
      for (const pk of Object.keys(this.gamepadSettings.p1) as Array<
        keyof PlayerKeyBindings
      >) {
        if (this.gamepadSettings.p1[pk] === code) {
          this.gamepadSettings.p1[pk] = prevCode;
        }
      }
      for (const pk of Object.keys(this.gamepadSettings.p2) as Array<
        keyof PlayerKeyBindings
      >) {
        if (this.gamepadSettings.p2[pk] === code) {
          this.gamepadSettings.p2[pk] = prevCode;
        }
      }
      this.gamepadSettings.common[key] = code;
    }
  }

  public updateGamepadBinding(
    group: 'p1' | 'p2' | 'common',
    action: string,
    code: string
  ): void {
    this.cancelAllInventoryHolds();
    this.applyGamepadBindingWithSwap(group, action, code);
    this.saveGamepadSettings();
    this.recomputeDirectionalHoldStates();
    this.bindingChangeListeners.forEach((cb) => cb());
  }

  public resetGamepadBindings(): void {
    this.cancelAllInventoryHolds();
    this.gamepadSettings = createDefaultGamepadControlSettings();
    this.saveGamepadSettings();
    this.recomputeDirectionalHoldStates();
    this.bindingChangeListeners.forEach((cb) => cb());
  }

  public resetBindings(): void {
    this.cancelAllInventoryHolds();
    this.settings = createDefaultControlSettings();
    this.gamepadSettings = createDefaultGamepadControlSettings();
    this.saveSettings();
    this.saveGamepadSettings();
    this.recomputeDirectionalHoldStates();
    this.bindingChangeListeners.forEach((cb) => cb());
  }

  public formatKeyLabel(code: string): string {
    return formatKeyCode(code);
  }

  public getFormattedKeyStrings(): ControlSettings {
    const mapPlayer = (b: PlayerKeyBindings): PlayerKeyBindings => ({
      Up: this.formatKeyLabel(b.Up),
      Down: this.formatKeyLabel(b.Down),
      Left: this.formatKeyLabel(b.Left),
      Right: this.formatKeyLabel(b.Right),
      UseItem: this.formatKeyLabel(b.UseItem),
      Interact: this.formatKeyLabel(b.Interact),
      Inventory: this.formatKeyLabel(b.Inventory),
      Ping: this.formatKeyLabel(b.Ping),
    });
    return {
      p1: mapPlayer(this.settings.p1),
      p2: mapPlayer(this.settings.p2),
      common: {
        SwitchDimensions: this.formatKeyLabel(
          this.settings.common.SwitchDimensions
        ),
        Pause: this.formatKeyLabel(this.settings.common.Pause),
        Mute: this.formatKeyLabel(this.settings.common.Mute),
      },
    };
  }

  public getEffectiveKeyStrings(): ControlSettings {
    const base = this.getFormattedKeyStrings();
    const mapGamepadPlayer = (gpRaw: PlayerKeyBindings): PlayerKeyBindings => ({
      Up: this.formatKeyLabel(gpRaw.Up),
      Down: this.formatKeyLabel(gpRaw.Down),
      Left: this.formatKeyLabel(gpRaw.Left),
      Right: this.formatKeyLabel(gpRaw.Right),
      UseItem: this.formatKeyLabel(gpRaw.UseItem),
      Interact: this.formatKeyLabel(gpRaw.Interact),
      Inventory: this.formatKeyLabel(gpRaw.Inventory),
      Ping: this.formatKeyLabel(gpRaw.Ping),
    });

    const p1PadActive = this.gamepadActive[1];
    const p2PadActive = this.gamepadActive[2];
    const anyPadActive = p1PadActive || p2PadActive;
    const onlineGp = this.getOnlineGamepadBindings();

    return {
      p1: p1PadActive
        ? mapGamepadPlayer(
            this.mode === 'online' ? onlineGp : this.gamepadSettings.p1
          )
        : base.p1,
      p2: p2PadActive
        ? mapGamepadPlayer(
            this.mode === 'online' ? onlineGp : this.gamepadSettings.p2
          )
        : base.p2,
      common: anyPadActive
        ? {
            SwitchDimensions: this.formatKeyLabel(
              this.gamepadSettings.common.SwitchDimensions
            ),
            Pause: this.formatKeyLabel(this.gamepadSettings.common.Pause),
            Mute: this.formatKeyLabel(this.gamepadSettings.common.Mute),
          }
        : base.common,
    };
  }

  public onPauseToggle(handler: () => void): () => void {
    this.pauseListeners.push(handler);
    return () => {
      this.pauseListeners = this.pauseListeners.filter((h) => h !== handler);
    };
  }

  public onMuteToggle(handler: () => void): () => void {
    this.muteListeners.push(handler);
    return () => {
      this.muteListeners = this.muteListeners.filter((h) => h !== handler);
    };
  }

  public onBindingsChange(handler: () => void): () => void {
    this.bindingChangeListeners.push(handler);
    return () => {
      this.bindingChangeListeners = this.bindingChangeListeners.filter(
        (h) => h !== handler
      );
    };
  }

  public onGamepadMenuAction(
    handler: (action: GamepadMenuAction, gamepadIndex: number) => void
  ): () => void {
    this.gamepadMenuActionListeners.push(handler);
    return () => {
      this.gamepadMenuActionListeners = this.gamepadMenuActionListeners.filter(
        (h) => h !== handler
      );
    };
  }

  public onGamepadButtonDown(
    handler: (buttonCode: string, gamepadIndex: number) => void
  ): () => void {
    this.gamepadButtonDownListeners.push(handler);
    return () => {
      this.gamepadButtonDownListeners = this.gamepadButtonDownListeners.filter(
        (h) => h !== handler
      );
    };
  }

  public onGamepadStatusChange(
    handler: (connectedCount: number) => void
  ): () => void {
    this.gamepadStatusListeners.push(handler);
    return () => {
      this.gamepadStatusListeners = this.gamepadStatusListeners.filter(
        (h) => h !== handler
      );
    };
  }

  public destroy(): void {
    this.clearHeldState();
    if (this.target) {
      this.target.removeEventListener('keydown', this.boundKeyDown);
      this.target.removeEventListener('keyup', this.boundKeyUp);
      this.target.removeEventListener('blur', this.boundBlur);
      this.target.removeEventListener(
        'gamepadconnected',
        this.boundGamepadChange
      );
      this.target.removeEventListener(
        'gamepaddisconnected',
        this.boundGamepadChange
      );
    }
    this.pauseListeners = [];
    this.muteListeners = [];
    this.bindingChangeListeners = [];
    this.gamepadMenuActionListeners = [];
    this.gamepadButtonDownListeners = [];
    this.gamepadStatusListeners = [];
  }
}
