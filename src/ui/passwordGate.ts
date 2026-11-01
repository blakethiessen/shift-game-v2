// src/ui/passwordGate.ts
// Retro FixedSys password gate screen protecting access to Shift: The Game.

export const ACCESS_PASSWORD = 'pizza';
export const STORAGE_KEY = 'shift_game_access_unlocked_v1';
export const SAVED_PASSWORD_STORAGE = 'shift_game_saved_password_v1';

export interface PasswordGateOptions {
  container?: HTMLElement;
  onUnlocked: () => void;
}

export function isAccessUnlocked(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function getSavedPassword(): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(SAVED_PASSWORD_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function savePassword(password: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (password) {
      localStorage.setItem(SAVED_PASSWORD_STORAGE, password);
    } else {
      localStorage.removeItem(SAVED_PASSWORD_STORAGE);
    }
  } catch {
    // Ignore storage errors
  }
}

export function grantAccess(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Ignore storage errors
  }
}

export function revokeAccess(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function setupPasswordGate(options: PasswordGateOptions): void {
  const host = options.container ?? document.body;

  // Remove any existing gate elements if re-initialized
  host.querySelector('[data-testid="password-gate-overlay"]')?.remove();
  host.querySelector('[data-testid="password-gate-relock"]')?.remove();

  // Global helper for testing or revoking access from console
  if (typeof window !== 'undefined') {
    (window as unknown as { __lockShiftGame?: () => void }).__lockShiftGame = () => {
      revokeAccess();
      window.location.reload();
    };
  }

  // Create subtle Lock button in bottom-left corner when unlocked
  const relockBtn = document.createElement('button');
  relockBtn.type = 'button';
  relockBtn.className = 'password-gate-relock is-hidden';
  relockBtn.setAttribute('data-testid', 'password-gate-relock');
  relockBtn.setAttribute('title', 'Lock Game (Require Password)');
  relockBtn.textContent = 'LOCK';
  relockBtn.addEventListener('click', () => {
    revokeAccess();
    if (typeof window !== 'undefined' && window.location?.reload) {
      window.location.reload();
    }
  });
  host.appendChild(relockBtn);

  // Create full-screen retro password gate overlay
  const overlay = document.createElement('div');
  overlay.className = 'password-gate-overlay';
  overlay.setAttribute('data-testid', 'password-gate-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'password-gate-title');

  // Prevent keyboard events inside the password gate from reaching window listeners
  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    e.stopPropagation();
  });

  // Already unlocked previously -> hide overlay immediately and boot game
  if (isAccessUnlocked()) {
    overlay.classList.add('is-hidden');
    relockBtn.classList.remove('is-hidden');
    host.appendChild(overlay);
    options.onUnlocked();
    return;
  }

  const logo = document.createElement('div');
  logo.className = 'shift-main-logo password-gate-logo';
  logo.setAttribute('role', 'img');
  logo.setAttribute('aria-label', 'Shift: The Game');
  overlay.appendChild(logo);

  const outerFrame = document.createElement('div');
  outerFrame.className = 'menu-outer-frame password-gate-card';

  const innerFrame = document.createElement('div');
  innerFrame.className = 'menu-inner-frame password-gate-inner';

  const title = document.createElement('h1');
  title.id = 'password-gate-title';
  title.className = 'password-gate-title';
  title.textContent = '- RESTRICTED ACCESS -';
  innerFrame.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'password-gate-subtitle';
  subtitle.textContent = 'Enter the password to enter the mansion';
  innerFrame.appendChild(subtitle);

  const form = document.createElement('form');
  form.className = 'password-gate-form';
  form.setAttribute('data-testid', 'password-gate-form');

  const label = document.createElement('label');
  label.htmlFor = 'password-gate-input';
  label.className = 'password-gate-label';
  label.textContent = 'Password';
  form.appendChild(label);

  const inputRow = document.createElement('div');
  inputRow.className = 'password-gate-input-row';

  const input = document.createElement('input');
  input.id = 'password-gate-input';
  input.name = 'password';
  input.type = 'password';
  input.className = 'lobby-input password-gate-input';
  input.setAttribute('data-testid', 'password-gate-input');
  input.setAttribute('autocomplete', 'current-password');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('enterkeyhint', 'done');
  input.placeholder = '••••••••';

  const saved = getSavedPassword();
  if (saved) {
    input.value = saved;
  }

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'action-btn password-gate-toggle';
  toggleBtn.setAttribute('data-testid', 'password-gate-toggle');
  toggleBtn.setAttribute('aria-label', 'Show password');
  toggleBtn.textContent = 'SHOW';
  toggleBtn.addEventListener('click', () => {
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    toggleBtn.textContent = isPassword ? 'HIDE' : 'SHOW';
    toggleBtn.setAttribute(
      'aria-label',
      isPassword ? 'Hide password' : 'Show password'
    );
    input.focus();
  });

  inputRow.appendChild(input);
  inputRow.appendChild(toggleBtn);
  form.appendChild(inputRow);

  const msgEl = document.createElement('div');
  msgEl.className = 'password-gate-msg';
  msgEl.setAttribute('data-testid', 'password-gate-msg');
  msgEl.setAttribute('role', 'status');
  msgEl.setAttribute('aria-live', 'polite');
  form.appendChild(msgEl);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'action-btn password-gate-submit';
  submitBtn.setAttribute('data-testid', 'password-gate-submit');
  submitBtn.textContent = 'UNLOCK GAME';
  form.appendChild(submitBtn);

  const setError = (message: string) => {
    msgEl.textContent = message;
    msgEl.className = 'password-gate-msg is-error';
    input.classList.add('is-error');
    outerFrame.classList.remove('is-shaking');
    void outerFrame.offsetWidth;
    outerFrame.classList.add('is-shaking');
    input.select();
  };

  const setSuccess = (message: string) => {
    msgEl.textContent = message;
    msgEl.className = 'password-gate-msg is-success';
    input.classList.remove('is-error');
    input.classList.add('is-success');
    input.disabled = true;
    submitBtn.disabled = true;
  };

  const handleSubmit = () => {
    const entered = input.value.trim().toLowerCase();
    if (!entered) {
      setError('PLEASE ENTER PASSWORD');
      return;
    }

    if (entered === ACCESS_PASSWORD.toLowerCase()) {
      setSuccess('ACCESS GRANTED // ENTERING MANSION...');
      savePassword(entered);
      grantAccess();

      setTimeout(() => {
        overlay.classList.add('is-hidden');
        relockBtn.classList.remove('is-hidden');
        options.onUnlocked();
      }, 300);
    } else {
      setError('ACCESS DENIED // INVALID PASSWORD');
    }
  };

  form.addEventListener('submit', (e: Event) => {
    e.preventDefault();
    handleSubmit();
  });

  input.addEventListener('input', () => {
    input.classList.remove('is-error');
    if (msgEl.classList.contains('is-error')) {
      msgEl.textContent = '';
      msgEl.className = 'password-gate-msg';
    }
    savePassword(input.value.trim());
  });

  innerFrame.appendChild(form);
  outerFrame.appendChild(innerFrame);
  overlay.appendChild(outerFrame);
  host.appendChild(overlay);

  setTimeout(() => {
    input.focus();
  }, 50);
}
