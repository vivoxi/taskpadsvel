import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'taskpad-theme';

function applyTheme(mode: ThemeMode) {
  if (!browser) return;
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.style.colorScheme = mode;
}

function resolveInitialTheme(): ThemeMode {
  if (!browser) return 'dark';

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const initialTheme = resolveInitialTheme();

export const themeMode = writable<ThemeMode>(initialTheme);

if (browser) {
  applyTheme(initialTheme);
}

export function initializeTheme() {
  const mode = resolveInitialTheme();
  themeMode.set(mode);
  applyTheme(mode);
}

export function setTheme(mode: ThemeMode) {
  if (browser) {
    localStorage.setItem(STORAGE_KEY, mode);
  }
  applyTheme(mode);
  themeMode.set(mode);
}

export function toggleTheme() {
  let nextTheme: ThemeMode = 'dark';
  themeMode.subscribe((mode) => {
    nextTheme = mode === 'dark' ? 'light' : 'dark';
  })();
  setTheme(nextTheme);
}
