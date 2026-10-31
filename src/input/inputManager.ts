import {
  CommonKeyBindings,
  ControlSettings,
  DirectionalState,
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
export const INVENTORY_HOLD_DROP_MS = 1000;

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
};

export function formatKeyCode(code: string): string {
  if (!code) return '';
  if (KEY_CODE_LABELS[code]) {
    return KEY_CODE_LABELS[code];
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

interface InventoryHoldTracker {
  activeCode: string | null;
  timerId: ReturnType<typeof setTimeout> | null;
  droppedOnHold: boolean;
}

export interface InputManagerOptions {
  mode?: PlayMode;
  localPlayerId?: PlayerId;
  storage?: Storage | null;
  target?: EventTarget | null;
}

export class InputManager implements IInputManager {
  private settings: ControlSettings;
  private mode: PlayMode;
  private localPlayerId: PlayerId;
  private storage: Storage | null;
  private target: EventTarget | null;
  private enabled = true;

  private p1Input: PlayerInput = createDefaultPlayerInput();
  private p2Input: PlayerInput = createDefaultPlayerInput();

  private pressedCodes = new Set<string>();

  private virtualDirs: Record<PlayerId, DirectionalState> = {
    1: { up: false, down: false, left: false, right: false },
    2: { up: false, down: false, left: false, right: false },
  };

  private invHold: Record<PlayerId, InventoryHoldTracker> = {
    1: { activeCode: null, timerId: null, droppedOnHold: false },
    2: { activeCode: null, timerId: null, droppedOnHold: false },
  };

  private pauseListeners: Array<() => void> = [];
  private muteListeners: Array<() => void> = [];

  private readonly boundKeyDown: (e: Event) => void;
  private readonly boundKeyUp: (e: Event) => void;
  private readonly boundBlur: () => void;

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

    this.settings = this.loadSettings();

    this.boundKeyDown = (e: Event) => this.handleKeyDown(e as KeyboardEvent);
    this.boundKeyUp = (e: Event) => this.handleKeyUp(e as KeyboardEvent);
    this.boundBlur = () => this.clearHeldState();

    if (this.target) {
      this.target.addEventListener('keydown', this.boundKeyDown);
      this.target.addEventListener('keyup', this.boundKeyUp);
      this.target.addEventListener('blur', this.boundBlur);
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

    const p1Up = checkDown(this.settings.p1.Up) || this.virtualDirs[1].up;
    const p1Down = checkDown(this.settings.p1.Down) || this.virtualDirs[1].down;
    const p1Left = checkDown(this.settings.p1.Left) || this.virtualDirs[1].left;
    const p1Right = checkDown(this.settings.p1.Right) || this.virtualDirs[1].right;

    const p2Up = checkDown(this.settings.p2.Up) || this.virtualDirs[2].up;
    const p2Down = checkDown(this.settings.p2.Down) || this.virtualDirs[2].down;
    const p2Left = checkDown(this.settings.p2.Left) || this.virtualDirs[2].left;
    const p2Right = checkDown(this.settings.p2.Right) || this.virtualDirs[2].right;

    if (this.mode === 'online') {
      // In Online Mode, allow the local player (whether P1 Host or P2 Client)
      // to use either WASD or Arrow keys comfortably on their own computer.
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

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    const code = e.code;
    if (!code) return;

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

  public triggerPause(): void {
    if (!this.enabled) return;
    this.pauseListeners.forEach((cb) => cb());
  }

  public triggerMute(): void {
    if (!this.enabled) return;
    this.muteListeners.forEach((cb) => cb());
  }

  public getPlayerInput(playerId: PlayerId): PlayerInput {
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

  public updateBinding(
    group: 'p1' | 'p2' | 'common',
    action: string,
    code: string
  ): void {
    if (group === 'p1' && action in this.settings.p1) {
      this.settings.p1[action as keyof PlayerKeyBindings] = code;
    } else if (group === 'p2' && action in this.settings.p2) {
      this.settings.p2[action as keyof PlayerKeyBindings] = code;
    } else if (group === 'common' && action in this.settings.common) {
      this.settings.common[action as keyof CommonKeyBindings] = code;
    }
    this.saveSettings();
    this.recomputeDirectionalHoldStates();
  }

  public resetBindings(): void {
    this.settings = createDefaultControlSettings();
    this.saveSettings();
    this.recomputeDirectionalHoldStates();
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

  public destroy(): void {
    this.clearHeldState();
    if (this.target) {
      this.target.removeEventListener('keydown', this.boundKeyDown);
      this.target.removeEventListener('keyup', this.boundKeyUp);
      this.target.removeEventListener('blur', this.boundBlur);
    }
    this.pauseListeners = [];
    this.muteListeners = [];
  }
}
