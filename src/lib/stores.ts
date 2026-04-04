import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type ActiveView = 'weekly' | 'monthly' | 'random' | 'thisweek';

export const activeView = writable<ActiveView>('weekly');
export const weekOffset = writable<number>(0);
export const generatedWeeks = writable<Set<string>>(new Set());

const AUTH_PASSWORD_STORAGE_KEY = 'taskpad-admin-password';
const initialAuthPassword = browser ? sessionStorage.getItem(AUTH_PASSWORD_STORAGE_KEY) ?? '' : '';

export const authPassword = writable<string>(initialAuthPassword);

if (browser) {
  authPassword.subscribe((value) => {
    const password = value.trim();

    if (password) {
      sessionStorage.setItem(AUTH_PASSWORD_STORAGE_KEY, password);
      return;
    }

    sessionStorage.removeItem(AUTH_PASSWORD_STORAGE_KEY);
  });
}
