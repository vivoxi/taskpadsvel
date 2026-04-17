import { writable } from 'svelte/store';

interface ConfirmState {
  open: boolean;
  message: string;
  title: string;
  resolve: (value: boolean) => void;
}

export const confirmState = writable<ConfirmState>({
  open: false,
  message: '',
  title: '',
  resolve: () => {}
});

export function showConfirm(message: string, title = 'Are you sure?'): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState.set({ open: true, message, title, resolve });
  });
}
