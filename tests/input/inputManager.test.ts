// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  InputManager,
  STORAGE_KEY,
  createDefaultControlSettings,
} from '../../src/input/inputManager';

describe('InputManager', () => {
  let input: InputManager;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    input = new InputManager();
  });

  afterEach(() => {
    input.destroy();
    vi.useRealTimers();
  });

  describe('Default Keybindings & Formatting', () => {
    it('initializes with default keybindings matching original game + Online Co-op ergonomics', () => {
      const settings = input.getSettings();
      expect(settings.p1).toEqual({
        Up: 'KeyW',
        Down: 'KeyS',
        Left: 'KeyA',
        Right: 'KeyD',
        UseItem: 'KeyQ',
        Interact: 'Digit1',
        Inventory: 'Digit2',
        Ping: 'KeyE',
      });
      expect(settings.p2).toEqual({
        Up: 'ArrowUp',
        Down: 'ArrowDown',
        Left: 'ArrowLeft',
        Right: 'ArrowRight',
        UseItem: 'Quote',
        Interact: 'BracketRight',
        Inventory: 'BracketLeft',
        Ping: 'Slash',
      });
      expect(settings.common).toEqual({
        SwitchDimensions: 'ShiftLeft',
        Pause: 'KeyP',
        Mute: 'KeyM',
      });
    });

    it('formats key codes into clean retro UI labels via formatKeyLabel', () => {
      expect(input.formatKeyLabel('KeyW')).toBe('W');
      expect(input.formatKeyLabel('Digit1')).toBe('1');
      expect(input.formatKeyLabel('Quote')).toBe("'");
      expect(input.formatKeyLabel('BracketRight')).toBe(']');
      expect(input.formatKeyLabel('BracketLeft')).toBe('[');
      expect(input.formatKeyLabel('ShiftLeft')).toBe('SHIFT');
      expect(input.formatKeyLabel('ShiftRight')).toBe('SHIFT');
      expect(input.formatKeyLabel('ArrowUp')).toBe('UP');
      expect(input.formatKeyLabel('ArrowDown')).toBe('DOWN');
      expect(input.formatKeyLabel('ArrowLeft')).toBe('LEFT');
      expect(input.formatKeyLabel('ArrowRight')).toBe('RIGHT');
      expect(input.formatKeyLabel('Slash')).toBe('/');
    });
  });

  describe('Movement & Discrete Action Sequence Counters (Local Mode)', () => {
    it('tracks movement hold states and monotonic sequence counters for P1 and P2', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));

      let p1 = input.getPlayerInput(1);
      let p2 = input.getPlayerInput(2);
      expect(p1.up).toBe(true);
      expect(p1.right).toBe(true);
      expect(p1.down).toBe(false);
      expect(p2.down).toBe(true);
      expect(p2.up).toBe(false);

      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
      p1 = input.getPlayerInput(1);
      expect(p1.up).toBe(false);
      expect(p1.right).toBe(true);

      // Discrete actions: UseItem, Interact, Ping, Shift
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftRight' }));

      p1 = input.getPlayerInput(1);
      expect(p1.useItemSeq).toBe(1);
      expect(p1.interactSeq).toBe(1);
      expect(p1.pingSeq).toBe(1);
      expect(p1.shiftRequestSeq).toBe(1);

      // P2 discrete actions
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Quote' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'BracketRight' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Slash' }));
      p2 = input.getPlayerInput(2);
      expect(p2.useItemSeq).toBe(1);
      expect(p2.interactSeq).toBe(1);
      expect(p2.pingSeq).toBe(1);
    });
  });

  describe('Inventory Hold vs. Tap (1000ms threshold)', () => {
    it('increments inventoryCycleSeq when Inventory key is released before 1000ms', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }));
      vi.advanceTimersByTime(450);
      expect(input.getPlayerInput(1).inventoryCycleSeq).toBe(0);
      expect(input.getPlayerInput(1).inventoryDropSeq).toBe(0);

      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit2' }));
      expect(input.getPlayerInput(1).inventoryCycleSeq).toBe(1);
      expect(input.getPlayerInput(1).inventoryDropSeq).toBe(0);

      // Advancing past 1000ms after release must NOT trigger a drop
      vi.advanceTimersByTime(1000);
      expect(input.getPlayerInput(1).inventoryDropSeq).toBe(0);
    });

    it('increments inventoryDropSeq immediately at 1000ms when held and does NOT cycle on release', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }));
      vi.advanceTimersByTime(999);
      expect(input.getPlayerInput(1).inventoryDropSeq).toBe(0);

      vi.advanceTimersByTime(1);
      expect(input.getPlayerInput(1).inventoryDropSeq).toBe(1);
      expect(input.getPlayerInput(1).inventoryCycleSeq).toBe(0);

      // Releasing after hold must NOT increment inventoryCycleSeq
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit2' }));
      expect(input.getPlayerInput(1).inventoryCycleSeq).toBe(0);
      expect(input.getPlayerInput(1).inventoryDropSeq).toBe(1);
    });
  });

  describe('Online Mode Dual Keybinding Ergonomics', () => {
    it('allows Player 2 (Client) or Player 1 (Host) in online mode to use WASD+Q/1/2/E OR Arrow keys', () => {
      input.setPlayMode('online', 2);

      // Client (Player 2) uses WASD and Q/1/E on their own keyboard
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));

      const p2 = input.getPlayerInput(2);
      expect(p2.up).toBe(true);
      expect(p2.useItemSeq).toBe(1);
      expect(p2.interactSeq).toBe(1);

      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
      expect(input.getPlayerInput(2).up).toBe(false);

      // Client can also use ArrowUp / Quote
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Quote' }));
      expect(input.getPlayerInput(2).up).toBe(true);
      expect(input.getPlayerInput(2).useItemSeq).toBe(2);

      // Pressing ShiftLeft in Online Mode only increments the local player's shiftRequestSeq!
      input.setPlayMode('online', 1);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
      expect(input.getPlayerInput(1).shiftRequestSeq).toBe(1);
      expect(input.getPlayerInput(2).shiftRequestSeq).toBe(0);
    });
  });

  describe('Custom Keybinding Persistence (localStorage)', () => {
    it('persists updated bindings to shift_game_controls_v2 and reloads them in new instances', () => {
      input.updateBinding('p1', 'Interact', 'KeyF');
      input.updateBinding('common', 'Pause', 'Escape');

      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();

      const secondInput = new InputManager();
      expect(secondInput.getSettings().p1.Interact).toBe('KeyF');
      expect(secondInput.getSettings().common.Pause).toBe('Escape');
      secondInput.destroy();
    });

    it('fires onPauseToggle and onMuteToggle callbacks and clears held state on window blur', () => {
      const onPause = vi.fn();
      const onMute = vi.fn();
      const unsubPause = input.onPauseToggle(onPause);
      input.onMuteToggle(onMute);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' }));
      expect(onPause).toHaveBeenCalledTimes(1);
      expect(onMute).toHaveBeenCalledTimes(1);

      unsubPause();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
      expect(onPause).toHaveBeenCalledTimes(1);

      // Hold movement & inventory, then trigger window blur
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }));
      expect(input.getPlayerInput(1).up).toBe(true);

      window.dispatchEvent(new Event('blur'));
      expect(input.getPlayerInput(1).up).toBe(false);
      vi.advanceTimersByTime(1500);
      expect(input.getPlayerInput(1).inventoryDropSeq).toBe(0);
    });
  });

  describe('Virtual / Mobile Touch Input API', () => {
    it('supports independent P1 and P2 virtual movement and discrete actions in Local Mode', () => {
      input.setPlayMode('local', 1);

      input.setVirtualDirection(1, { up: true, right: true });
      input.setVirtualDirection(2, { down: true, left: true });

      expect(input.getPlayerInput(1)).toMatchObject({
        up: true,
        right: true,
        down: false,
        left: false,
      });
      expect(input.getPlayerInput(2)).toMatchObject({
        up: false,
        right: false,
        down: true,
        left: true,
      });

      input.triggerVirtualAction(1, 'interact');
      input.triggerVirtualAction(1, 'useItem');
      input.triggerVirtualAction(2, 'ping');
      input.triggerVirtualAction(2, 'shift');

      const p1 = input.getPlayerInput(1);
      const p2 = input.getPlayerInput(2);
      expect(p1.interactSeq).toBe(1);
      expect(p1.useItemSeq).toBe(1);
      expect(p2.pingSeq).toBe(1);
      expect(p2.pingKind).toBe('here');
      // Each player's Shift button increments that player's shiftRequestSeq so both
      // Cooperative and Individual shift modes work in Local Head-to-Head Mobile Co-op
      expect(p1.shiftRequestSeq).toBe(0);
      expect(p2.shiftRequestSeq).toBe(1);

      input.triggerVirtualAction(1, 'shift');
      expect(input.getPlayerInput(1).shiftRequestSeq).toBe(1);
    });

    it('supports virtual inventory tap (<1000ms cycle), hold (>=1000ms drop), and cancel without cycling', () => {
      input.setPlayMode('local', 1);

      // Tap < 1000ms -> cycle
      input.startVirtualInventoryPress(1);
      vi.advanceTimersByTime(300);
      input.endVirtualInventoryPress(1);
      expect(input.getPlayerInput(1).inventoryCycleSeq).toBe(1);
      expect(input.getPlayerInput(1).inventoryDropSeq).toBe(0);

      // Hold >= 1000ms -> drop
      input.startVirtualInventoryPress(2);
      vi.advanceTimersByTime(1000);
      expect(input.getPlayerInput(2).inventoryDropSeq).toBe(1);
      expect(input.getPlayerInput(2).inventoryCycleSeq).toBe(0);

      input.endVirtualInventoryPress(2);
      expect(input.getPlayerInput(2).inventoryCycleSeq).toBe(0);

      // Cancel mid-hold (e.g. pointercancel or blur) -> neither cycles nor drops
      input.startVirtualInventoryPress(1);
      vi.advanceTimersByTime(400);
      input.cancelVirtualInventoryPress(1);
      vi.advanceTimersByTime(1000);
      expect(input.getPlayerInput(1).inventoryCycleSeq).toBe(1);
      expect(input.getPlayerInput(1).inventoryDropSeq).toBe(0);
    });

    it('routes virtual input to localPlayerId in Online Mode and only increments local shiftRequestSeq', () => {
      input.setPlayMode('online', 2);

      input.setVirtualDirection(2, { up: true, left: true });
      input.triggerVirtualAction(2, 'interact');
      input.triggerVirtualAction(2, 'shift');

      const p2 = input.getPlayerInput(2);
      expect(p2.up).toBe(true);
      expect(p2.left).toBe(true);
      expect(p2.interactSeq).toBe(1);
      expect(p2.shiftRequestSeq).toBe(1);
      expect(input.getPlayerInput(1).shiftRequestSeq).toBe(0);
    });
  });

  describe('Gamepad / Controller Support (W3C Standard Gamepad API)', () => {
    interface MockGamepadState {
      index: number;
      id?: string;
      connected?: boolean;
      axes: number[];
      buttons: Array<{ pressed: boolean; value: number }>;
    }

    function createMockGamepad(
      index: number,
      overrides: Partial<MockGamepadState> = {}
    ): Gamepad {
      const buttons = Array.from({ length: 16 }, () => ({
        pressed: false,
        value: 0,
        touched: false,
      }));
      if (overrides.buttons) {
        overrides.buttons.forEach((b, i) => {
          if (b) {
            buttons[i] = {
              pressed: b.pressed,
              value: b.value,
              touched: b.pressed,
            };
          }
        });
      }
      return {
        index,
        id: overrides.id ?? `Xbox 360 Controller (Standard Gamepad #${index})`,
        connected: overrides.connected ?? true,
        mapping: 'standard',
        axes: overrides.axes ?? [0, 0, 0, 0],
        buttons,
        timestamp: performance.now(),
        hapticActuators: [],
        vibrationActuator: null,
      } as unknown as Gamepad;
    }

    it('supports Left Stick (with radial deadzone) and D-Pad 8-way movement alongside keyboard', () => {
      let pads: (Gamepad | null)[] = [createMockGamepad(0)];
      const gpInput = new InputManager({
        gamepadProvider: () => pads,
      });

      // Sub-deadzone stick deflection (< 0.25) -> no movement
      pads = [createMockGamepad(0, { axes: [0.15, -0.15, 0, 0] })];
      expect(gpInput.getPlayerInput(1)).toMatchObject({
        up: false,
        down: false,
        left: false,
        right: false,
      });

      // Diagonal Up-Right stick deflection
      pads = [createMockGamepad(0, { axes: [0.8, -0.8, 0, 0] })];
      expect(gpInput.getPlayerInput(1)).toMatchObject({
        up: true,
        right: true,
        down: false,
        left: false,
      });

      // Return stick to neutral, press D-Pad Down (13) + Left (14)
      const btns = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      btns[13] = { pressed: true, value: 1 };
      btns[14] = { pressed: true, value: 1 };
      pads = [createMockGamepad(0, { axes: [0, 0, 0, 0], buttons: btns })];
      expect(gpInput.getPlayerInput(1)).toMatchObject({
        up: false,
        right: false,
        down: true,
        left: true,
      });

      // Release D-Pad while holding Keyboard W -> Up remains true
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      pads = [createMockGamepad(0)];
      expect(gpInput.getPlayerInput(1)).toMatchObject({
        up: true,
        down: false,
        left: false,
        right: false,
      });

      gpInput.destroy();
    });

    it('triggers discrete actions on button rising edges and supports 1000ms Inventory tap-vs-hold on controller', () => {
      let btns = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      let pads: (Gamepad | null)[] = [createMockGamepad(0, { buttons: btns })];
      const onPause = vi.fn();
      const onMute = vi.fn();

      const gpInput = new InputManager({
        gamepadProvider: () => pads,
      });
      gpInput.onPauseToggle(onPause);
      gpInput.onMuteToggle(onMute);

      // Press A (0 -> Interact), X (2 -> UseItem), B (1 -> Ping), RB (5 -> Shift), Start (9 -> Pause), Back (8 -> Mute)
      btns[0] = { pressed: true, value: 1 };
      btns[2] = { pressed: true, value: 1 };
      btns[1] = { pressed: true, value: 1 };
      btns[5] = { pressed: true, value: 1 };
      btns[9] = { pressed: true, value: 1 };
      btns[8] = { pressed: true, value: 1 };
      pads = [createMockGamepad(0, { buttons: btns })];

      let p1 = gpInput.getPlayerInput(1);
      expect(p1.interactSeq).toBe(1);
      expect(p1.useItemSeq).toBe(1);
      expect(p1.pingSeq).toBe(1);
      expect(p1.pingKind).toBe('here');
      expect(p1.shiftRequestSeq).toBe(1);
      expect(onPause).toHaveBeenCalledTimes(1);
      expect(onMute).toHaveBeenCalledTimes(1);

      // Holding buttons across subsequent polls must NOT re-trigger discrete actions
      p1 = gpInput.getPlayerInput(1);
      expect(p1.interactSeq).toBe(1);
      expect(p1.useItemSeq).toBe(1);
      expect(p1.pingSeq).toBe(1);
      expect(p1.shiftRequestSeq).toBe(1);
      expect(onPause).toHaveBeenCalledTimes(1);

      // Release all buttons, then test RT (7 -> UseItem) and LT (6 -> Shift)
      btns = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      btns[7] = { pressed: false, value: 0.75 }; // Analog trigger value >= 0.5
      btns[6] = { pressed: true, value: 0.9 };
      pads = [createMockGamepad(0, { buttons: btns })];
      p1 = gpInput.getPlayerInput(1);
      expect(p1.useItemSeq).toBe(2);
      expect(p1.shiftRequestSeq).toBe(2);

      // Inventory Tap (< 1000ms) on Y (button 3) -> cycles on release
      btns = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      btns[3] = { pressed: true, value: 1 };
      pads = [createMockGamepad(0, { buttons: btns })];
      gpInput.pollGamepads();
      vi.advanceTimersByTime(400);
      expect(gpInput.getPlayerInput(1).inventoryCycleSeq).toBe(0);

      btns[3] = { pressed: false, value: 0 };
      pads = [createMockGamepad(0, { buttons: btns })];
      gpInput.pollGamepads();
      expect(gpInput.getPlayerInput(1).inventoryCycleSeq).toBe(1);
      expect(gpInput.getPlayerInput(1).inventoryDropSeq).toBe(0);

      // Inventory Hold (>= 1000ms) on LB (button 4) -> drops at 1000ms and does not cycle on release
      btns[4] = { pressed: true, value: 1 };
      pads = [createMockGamepad(0, { buttons: btns })];
      gpInput.pollGamepads();
      vi.advanceTimersByTime(1000);
      expect(gpInput.getPlayerInput(1).inventoryDropSeq).toBe(1);
      expect(gpInput.getPlayerInput(1).inventoryCycleSeq).toBe(1);

      btns[4] = { pressed: false, value: 0 };
      pads = [createMockGamepad(0, { buttons: btns })];
      gpInput.pollGamepads();
      expect(gpInput.getPlayerInput(1).inventoryCycleSeq).toBe(1);

      gpInput.destroy();
    });

    it('assigns 2 controllers to P1 and P2 in Local Mode, supports Single-Controller P1/P2 assignment, and routes any controller to localPlayerId in Online Mode', () => {
      const btns1 = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      const btns2 = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      btns1[0] = { pressed: true, value: 1 }; // Pad 0 presses A (Interact)
      btns2[5] = { pressed: true, value: 1 }; // Pad 1 presses RB (Shift)

      let pads: (Gamepad | null)[] = [
        createMockGamepad(0, { axes: [-0.9, 0, 0, 0], buttons: btns1 }),
        createMockGamepad(1, { axes: [0, 0.9, 0, 0], buttons: btns2 }),
      ];

      const gpInput = new InputManager({
        mode: 'local',
        gamepadProvider: () => pads,
      });

      const p1 = gpInput.getPlayerInput(1);
      const p2 = gpInput.getPlayerInput(2);
      expect(p1.left).toBe(true);
      expect(p1.interactSeq).toBe(1);
      expect(p1.shiftRequestSeq).toBe(0);

      expect(p2.down).toBe(true);
      expect(p2.interactSeq).toBe(0);
      expect(p2.shiftRequestSeq).toBe(1);

      // When only 1 controller is connected in Local Mode and setSingleGamepadPlayer(2) is configured,
      // Pad 0 controls Player 2 (allowing Player 1 to use WASD on keyboard and Player 2 to use the controller)
      gpInput.setSingleGamepadPlayer(2);
      expect(gpInput.getSingleGamepadPlayer()).toBe(2);
      const singleBtns = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      singleBtns[2] = { pressed: true, value: 1 }; // X -> UseItem
      pads = [createMockGamepad(0, { axes: [0, -0.9, 0, 0], buttons: singleBtns })];

      expect(gpInput.getPlayerInput(1).up).toBe(false);
      expect(gpInput.getPlayerInput(2).up).toBe(true);
      expect(gpInput.getPlayerInput(2).useItemSeq).toBe(1);

      // In Online Mode (Client = Player 2), any connected controller drives Player 2 and only increments P2 shiftRequestSeq
      gpInput.setPlayMode('online', 2);
      const onlineBtns = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      onlineBtns[5] = { pressed: true, value: 1 }; // RB -> Shift
      pads = [createMockGamepad(0, { axes: [0.9, 0, 0, 0], buttons: onlineBtns })];

      const onlineP2 = gpInput.getPlayerInput(2);
      expect(onlineP2.right).toBe(true);
      expect(onlineP2.shiftRequestSeq).toBe(2);
      expect(gpInput.getPlayerInput(1).shiftRequestSeq).toBe(0);

      gpInput.destroy();
    });

    it('supports custom GamepadButton bindings, dynamic active device detection, and menu navigation callbacks', () => {
      let btns = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      let pads: (Gamepad | null)[] = [createMockGamepad(0, { buttons: btns })];

      const gpInput = new InputManager({
        mode: 'local',
        gamepadProvider: () => pads,
      });

      expect(gpInput.formatKeyLabel('GamepadButton0')).toBe('PAD A');
      expect(gpInput.formatKeyLabel('GamepadButton1')).toBe('PAD B');
      expect(gpInput.formatKeyLabel('GamepadButton2')).toBe('PAD X');
      expect(gpInput.formatKeyLabel('GamepadButton3')).toBe('PAD Y');
      expect(gpInput.formatKeyLabel('GamepadButton4')).toBe('PAD LB');
      expect(gpInput.formatKeyLabel('GamepadButton5')).toBe('PAD RB');

      // Initially keyboard is active for P1
      expect(gpInput.isGamepadActiveForPlayer(1)).toBe(false);
      expect(gpInput.getEffectiveKeyStrings().p1.Interact).toBe('1');

      // Press A on Gamepad 0 -> P1 switches to active gamepad prompts
      btns[0] = { pressed: true, value: 1 };
      pads = [createMockGamepad(0, { buttons: btns })];
      gpInput.pollGamepads();
      expect(gpInput.isGamepadActiveForPlayer(1)).toBe(true);
      expect(gpInput.getEffectiveKeyStrings().p1.Interact).toBe('PAD A');
      expect(gpInput.getEffectiveKeyStrings().common.SwitchDimensions).toBe('PAD RB');

      // Press KeyW on keyboard -> P1 switches back to keyboard prompts
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      expect(gpInput.isGamepadActiveForPlayer(1)).toBe(false);
      expect(gpInput.getEffectiveKeyStrings().p1.Interact).toBe('1');

      // Menu navigation actions when InputManager is disabled (in menu overlay)
      gpInput.setEnabled(false);
      const menuActions: string[] = [];
      gpInput.onGamepadMenuAction((action) => menuActions.push(action));

      btns = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      btns[13] = { pressed: true, value: 1 }; // D-Pad Down
      pads = [createMockGamepad(0, { buttons: btns })];
      gpInput.pollGamepads();

      btns = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      btns[0] = { pressed: true, value: 1 }; // A -> confirm
      pads = [createMockGamepad(0, { buttons: btns })];
      gpInput.pollGamepads();

      expect(menuActions).toEqual(['down', 'confirm']);

      gpInput.destroy();
    });

    it('maintains separate reassignable Gamepad bindings in localStorage, auto-swaps conflicts within a group, and preserves keyboard bindings', () => {
      let btns = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      let pads: (Gamepad | null)[] = [createMockGamepad(0, { buttons: btns })];

      const gpInput = new InputManager({
        mode: 'local',
        gamepadProvider: () => pads,
      });

      const defaultGp = gpInput.getGamepadSettings();
      expect(defaultGp.p1).toEqual({
        Up: 'GamepadButton12',
        Down: 'GamepadButton13',
        Left: 'GamepadButton14',
        Right: 'GamepadButton15',
        UseItem: 'GamepadButton2',
        Interact: 'GamepadButton0',
        Inventory: 'GamepadButton3',
        Ping: 'GamepadButton1',
      });
      expect(defaultGp.common).toEqual({
        SwitchDimensions: 'GamepadButton5',
        Pause: 'GamepadButton9',
        Mute: 'GamepadButton8',
      });

      // Reassign P1 Gamepad Interact (was GamepadButton0 / PAD A) to GamepadButton2 (PAD X, which was UseItem)
      gpInput.updateGamepadBinding('p1', 'Interact', 'GamepadButton2');

      // Keyboard binding for P1 Interact must remain untouched ('Digit1')
      expect(gpInput.getSettings().p1.Interact).toBe('Digit1');
      // Gamepad Interact is now GamepadButton2 (PAD X), and UseItem auto-swapped to GamepadButton0 (PAD A)
      expect(gpInput.getGamepadSettings().p1.Interact).toBe('GamepadButton2');
      expect(gpInput.getGamepadSettings().p1.UseItem).toBe('GamepadButton0');

      // Reassign Common SwitchDimensions to GamepadButton4 (PAD LB)
      gpInput.updateGamepadBinding('common', 'SwitchDimensions', 'GamepadButton4');
      expect(gpInput.getGamepadSettings().common.SwitchDimensions).toBe('GamepadButton4');

      // Verify persistence in a new InputManager instance
      const reloaded = new InputManager({
        mode: 'local',
        gamepadProvider: () => pads,
      });
      expect(reloaded.getGamepadSettings().p1.Interact).toBe('GamepadButton2');
      expect(reloaded.getGamepadSettings().p1.UseItem).toBe('GamepadButton0');
      expect(reloaded.getGamepadSettings().common.SwitchDimensions).toBe('GamepadButton4');

      // Press PAD X (button 2) -> triggers Interact (not UseItem)
      btns[2] = { pressed: true, value: 1 };
      pads = [createMockGamepad(0, { buttons: btns })];
      const p1AfterX = reloaded.getPlayerInput(1);
      expect(p1AfterX.interactSeq).toBe(1);
      expect(p1AfterX.useItemSeq).toBe(0);

      // Press PAD A (button 0) -> triggers UseItem (swapped)
      btns = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      btns[0] = { pressed: true, value: 1 };
      pads = [createMockGamepad(0, { buttons: btns })];
      const p1AfterA = reloaded.getPlayerInput(1);
      expect(p1AfterA.useItemSeq).toBe(1);

      // Reset bindings -> restores defaults
      reloaded.resetBindings();
      expect(reloaded.getGamepadSettings().p1.Interact).toBe('GamepadButton0');
      expect(reloaded.getGamepadSettings().p1.UseItem).toBe('GamepadButton2');

      reloaded.destroy();
      gpInput.destroy();
    });

    it('prevents Online Mode rebinding collisions, swaps cross-group conflicts with common, routes vibration accurately, and cancels orphaned inventory hold timers on disconnect', () => {
      const playEffect0 = vi.fn();
      const playEffect1 = vi.fn();
      let btns0 = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      let pads: (Gamepad | null)[] = [
        {
          ...createMockGamepad(0, { buttons: btns0 }),
          vibrationActuator: { playEffect: playEffect0 },
        } as unknown as Gamepad,
      ];

      const gpInput = new InputManager({
        mode: 'online',
        localPlayerId: 1,
        gamepadProvider: () => pads,
      });

      // 1. Online Mode rebind: rebinding p1.Interact to GamepadButton2 (PAD X) must NOT trigger p2.UseItem simultaneously
      gpInput.updateGamepadBinding('p1', 'Interact', 'GamepadButton2');
      btns0[2] = { pressed: true, value: 1 };
      pads = [
        {
          ...createMockGamepad(0, { buttons: btns0 }),
          vibrationActuator: { playEffect: playEffect0 },
        } as unknown as Gamepad,
      ];
      const onlineP1 = gpInput.getPlayerInput(1);
      expect(onlineP1.interactSeq).toBe(1);
      expect(onlineP1.useItemSeq).toBe(0);

      // 2. Cross-group conflict swap: rebinding p1.Interact to GamepadButton5 (PAD RB, default common.SwitchDimensions)
      // swaps common.SwitchDimensions to the previous p1.Interact button (GamepadButton2) so PAD RB doesn't trigger both
      gpInput.updateGamepadBinding('p1', 'Interact', 'GamepadButton5');
      expect(gpInput.getGamepadSettings().p1.Interact).toBe('GamepadButton5');
      expect(gpInput.getGamepadSettings().common.SwitchDimensions).toBe('GamepadButton2');

      // 3. Vibration routing in Online Mode (localPlayerId = 1):
      // Remote partner (playerId = 2) damage must NOT vibrate local player's pad
      gpInput.triggerVibration(2, 150, 0.8, 0.5);
      expect(playEffect0).not.toHaveBeenCalled();
      // Local player (playerId = 1) damage DOES vibrate local player's pad
      gpInput.triggerVibration(1, 150, 0.8, 0.5);
      expect(playEffect0).toHaveBeenCalledTimes(1);

      // 4. Vibration routing in 1-Controller Local Mode (singleGamepadPlayer = 1):
      gpInput.setPlayMode('local', 1);
      gpInput.setSingleGamepadPlayer(1);
      playEffect0.mockClear();
      gpInput.triggerVibration(2, 150, 0.8, 0.5); // P2 is on keyboard -> should NOT vibrate P1's pad
      expect(playEffect0).not.toHaveBeenCalled();
      gpInput.triggerVibration(1, 150, 0.8, 0.5); // P1 is on pad -> vibrates pad 0
      expect(playEffect0).toHaveBeenCalledTimes(1);

      // 5. Orphaned 1000ms Inventory Hold timer cancelled if gamepad disconnects mid-hold
      btns0 = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      btns0[3] = { pressed: true, value: 1 }; // Hold Y (Inventory)
      pads = [
        {
          ...createMockGamepad(0, { buttons: btns0 }),
          vibrationActuator: { playEffect: playEffect0 },
        } as unknown as Gamepad,
      ];
      gpInput.pollGamepads();
      vi.advanceTimersByTime(400);

      // Gamepad disconnects before 1000ms elapses
      pads = [];
      gpInput.pollGamepads();
      vi.advanceTimersByTime(800);
      expect(gpInput.getPlayerInput(1).inventoryDropSeq).toBe(0);
      expect(gpInput.getPlayerInput(1).inventoryCycleSeq).toBe(0);

      void playEffect1;
      gpInput.destroy();
    });
  });
});
