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
});
