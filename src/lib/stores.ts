import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import type { SyncState } from '$lib/planner/types';

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

export const commandPaletteOpen = writable(false);
export const templateMode = persistedBooleanStore('taskpad-template-mode');
export const syncState = writable<SyncState>('synced');
