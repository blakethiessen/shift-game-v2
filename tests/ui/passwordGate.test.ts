// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ACCESS_PASSWORD,
  STORAGE_KEY,
  SAVED_PASSWORD_STORAGE,
  isAccessUnlocked,
  getSavedPassword,
  savePassword,
  grantAccess,
  revokeAccess,
  setupPasswordGate,
} from '../../src/ui/passwordGate';

describe('PasswordGate', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  describe('storage helpers', () => {
    it('exports expected password "pizza" and storage keys', () => {
      expect(ACCESS_PASSWORD).toBe('pizza');
      expect(STORAGE_KEY).toBe('shift_game_access_unlocked_v1');
      expect(SAVED_PASSWORD_STORAGE).toBe('shift_game_saved_password_v1');
    });

    it('returns false when access is not yet unlocked', () => {
      expect(isAccessUnlocked()).toBe(false);
    });

    it('grants and verifies access in localStorage', () => {
      grantAccess();
      expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
      expect(isAccessUnlocked()).toBe(true);
    });

    it('revokes access cleanly', () => {
      grantAccess();
      expect(isAccessUnlocked()).toBe(true);
      revokeAccess();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(isAccessUnlocked()).toBe(false);
    });

    it('saves and retrieves the entered password', () => {
      expect(getSavedPassword()).toBe('');
      savePassword('pizza');
      expect(localStorage.getItem(SAVED_PASSWORD_STORAGE)).toBe('pizza');
      expect(getSavedPassword()).toBe('pizza');
      savePassword('');
      expect(localStorage.getItem(SAVED_PASSWORD_STORAGE)).toBeNull();
      expect(getSavedPassword()).toBe('');
    });
  });

  describe('setupPasswordGate', () => {
    it('renders the password gate overlay when locked and does not call onUnlocked until unlocked', () => {
      const onUnlocked = vi.fn();
      setupPasswordGate({ onUnlocked });

      expect(onUnlocked).not.toHaveBeenCalled();

      const overlay = document.querySelector('[data-testid="password-gate-overlay"]') as HTMLElement;
      const input = document.querySelector('[data-testid="password-gate-input"]') as HTMLInputElement;
      const submitBtn = document.querySelector('[data-testid="password-gate-submit"]') as HTMLButtonElement;
      const toggleBtn = document.querySelector('[data-testid="password-gate-toggle"]') as HTMLButtonElement;

      expect(overlay).toBeTruthy();
      expect(overlay.classList.contains('is-hidden')).toBe(false);
      expect(input).toBeTruthy();
      expect(input.type).toBe('password');
      expect(input.getAttribute('autocomplete')).toBe('current-password');
      expect(submitBtn).toBeTruthy();
      expect(toggleBtn).toBeTruthy();
    });

    it('unlocks immediately if access was previously granted', () => {
      grantAccess();
      const onUnlocked = vi.fn();
      setupPasswordGate({ onUnlocked });

      expect(onUnlocked).toHaveBeenCalledTimes(1);
      const overlay = document.querySelector('[data-testid="password-gate-overlay"]') as HTMLElement | null;
      if (overlay) {
        expect(overlay.classList.contains('is-hidden')).toBe(true);
      }
      const relockBtn = document.querySelector('[data-testid="password-gate-relock"]') as HTMLButtonElement;
      expect(relockBtn).toBeTruthy();
      expect(relockBtn.classList.contains('is-hidden')).toBe(false);
    });

    it('toggles password input visibility between password and text', () => {
      const onUnlocked = vi.fn();
      setupPasswordGate({ onUnlocked });

      const input = document.querySelector('[data-testid="password-gate-input"]') as HTMLInputElement;
      const toggleBtn = document.querySelector('[data-testid="password-gate-toggle"]') as HTMLButtonElement;

      expect(input.type).toBe('password');
      toggleBtn.click();
      expect(input.type).toBe('text');
      toggleBtn.click();
      expect(input.type).toBe('password');
    });

    it('shows error message and does not unlock on empty submission', () => {
      const onUnlocked = vi.fn();
      setupPasswordGate({ onUnlocked });

      const form = document.querySelector('[data-testid="password-gate-form"]') as HTMLFormElement;
      const msgEl = document.querySelector('[data-testid="password-gate-msg"]') as HTMLElement;

      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      expect(onUnlocked).not.toHaveBeenCalled();
      expect(isAccessUnlocked()).toBe(false);
      expect(msgEl.textContent).toContain('ENTER PASSWORD');
      expect(msgEl.className).toContain('is-error');
    });

    it('shows error message and does not unlock on wrong password submission', () => {
      const onUnlocked = vi.fn();
      setupPasswordGate({ onUnlocked });

      const input = document.querySelector('[data-testid="password-gate-input"]') as HTMLInputElement;
      const form = document.querySelector('[data-testid="password-gate-form"]') as HTMLFormElement;
      const msgEl = document.querySelector('[data-testid="password-gate-msg"]') as HTMLElement;

      input.value = 'anchovies';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      expect(onUnlocked).not.toHaveBeenCalled();
      expect(isAccessUnlocked()).toBe(false);
      expect(msgEl.textContent).toContain('ACCESS DENIED');
      expect(msgEl.className).toContain('is-error');
    });

    it('grants access and calls onUnlocked when "pizza" is submitted (case-insensitive)', () => {
      vi.useFakeTimers();
      const onUnlocked = vi.fn();
      setupPasswordGate({ onUnlocked });

      const input = document.querySelector('[data-testid="password-gate-input"]') as HTMLInputElement;
      const form = document.querySelector('[data-testid="password-gate-form"]') as HTMLFormElement;
      const msgEl = document.querySelector('[data-testid="password-gate-msg"]') as HTMLElement;
      const overlay = document.querySelector('[data-testid="password-gate-overlay"]') as HTMLElement;

      input.value = '  PIZZA ';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      expect(isAccessUnlocked()).toBe(true);
      expect(getSavedPassword()).toBe('pizza');
      expect(msgEl.textContent).toContain('ACCESS GRANTED');
      expect(msgEl.className).toContain('is-success');

      vi.advanceTimersByTime(500);

      expect(onUnlocked).toHaveBeenCalledTimes(1);
      expect(overlay.classList.contains('is-hidden')).toBe(true);

      const relockBtn = document.querySelector('[data-testid="password-gate-relock"]') as HTMLButtonElement;
      expect(relockBtn.classList.contains('is-hidden')).toBe(false);

      vi.useRealTimers();
    });

    it('pre-fills input with saved password if present and updates saved password on input', () => {
      savePassword('pizza');
      const onUnlocked = vi.fn();
      setupPasswordGate({ onUnlocked });

      const input = document.querySelector('[data-testid="password-gate-input"]') as HTMLInputElement;
      expect(input.value).toBe('pizza');

      input.value = 'calzone';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(getSavedPassword()).toBe('calzone');
    });

    it('blocks keydown events from propagating to window when typing inside the password gate', () => {
      const onUnlocked = vi.fn();
      setupPasswordGate({ onUnlocked });

      const windowKeyListener = vi.fn();
      window.addEventListener('keydown', windowKeyListener);

      const input = document.querySelector('[data-testid="password-gate-input"]') as HTMLInputElement;
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));

      expect(windowKeyListener).not.toHaveBeenCalled();
      window.removeEventListener('keydown', windowKeyListener);
    });
  });
});
