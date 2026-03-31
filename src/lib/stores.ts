import { writable } from 'svelte/store';

export type ActiveView = 'weekly' | 'monthly' | 'random' | 'thisweek';

export const activeView = writable<ActiveView>('weekly');
export const weekOffset = writable<number>(0);
export const generatedWeeks = writable<Set<string>>(new Set());
export const authPassword = writable<string>('');
