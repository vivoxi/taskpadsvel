import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import type { SyncState } from '$lib/planner/types';

function persistedStringStore(key: string, storage: Storage, initial = '') {
  const store = writable<string>(browser ? storage.getItem(key) ?? initial : initial);

  if (browser) {
    store.subscribe((value) => {
      const trimmed = value.trim();

      if (trimmed) {
        storage.setItem(key, trimmed);
      } else {
        storage.removeItem(key);
      }
    });
  }

  return store;
}

function persistedBooleanStore(key: string, initial = false) {
  const store = writable<boolean>(
    browser ? window.localStorage.getItem(key) === 'true' : initial
  );

  if (browser) {
    store.subscribe((value) => {
      window.localStorage.setItem(key, value ? 'true' : 'false');
    });
  }

  return store;
}

const AUTH_PASSWORD_STORAGE_KEY = 'taskpad-admin-password';

export const authPassword = persistedStringStore(
  AUTH_PASSWORD_STORAGE_KEY,
  browser ? window.localStorage : ({} as Storage)
);

export const commandPaletteOpen = writable(false);
export const templateMode = persistedBooleanStore('taskpad-template-mode');
export const syncState = writable<SyncState>('synced');
