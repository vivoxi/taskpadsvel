<script lang="ts">
  import { confirmState } from '$lib/stores/confirm';

  function handleConfirm() {
    $confirmState.resolve(true);
    confirmState.update((s) => ({ ...s, open: false }));
  }

  function handleCancel() {
    $confirmState.resolve(false);
    confirmState.update((s) => ({ ...s, open: false }));
  }

  function onBackdropKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleCancel();
  }
</script>

{#if $confirmState.open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
    role="presentation"
    onkeydown={onBackdropKeydown}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
      class="flex w-[min(90vw,24rem)] flex-col gap-4 rounded-[18px] border border-[var(--border)] bg-[var(--panel)] p-6 shadow-[var(--shadow-soft)]"
    >
      <h2 id="confirm-modal-title" class="text-sm font-semibold text-[var(--text-primary)]">
        {$confirmState.title}
      </h2>
      <p id="confirm-modal-desc" class="text-sm text-[var(--text-muted)]">
        {$confirmState.message}
      </p>
      <div class="flex justify-end gap-2">
        <button
          onclick={handleCancel}
          class="rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          Cancel
        </button>
        <button
          onclick={handleConfirm}
          class="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] transition-opacity hover:opacity-80"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
{/if}
