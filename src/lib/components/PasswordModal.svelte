<script lang="ts">
  import { authPassword } from '$lib/stores';

  let input = $state('');

  function submit() {
    if (input.trim()) {
      authPassword.set(input.trim());
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') submit();
  }
</script>

{#if !$authPassword}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
    role="dialog"
    aria-modal="true"
    aria-labelledby="password-modal-title"
  >
    <div class="flex w-80 flex-col gap-4 rounded-[18px] border border-[var(--border)] bg-[var(--panel)] p-6 shadow-[var(--shadow-soft)]">
      <h2 id="password-modal-title" class="text-sm font-semibold text-[var(--text-primary)]">Password Required</h2>
      <p class="text-sm text-[var(--text-muted)]">
        Enter the admin password to view and make changes.
      </p>
      <input
        type="password"
        bind:value={input}
        onkeydown={onKeydown}
        placeholder="Password"
        class="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)] focus:ring-0"
      />
      <button
        onclick={submit}
        class="w-full rounded-xl bg-[var(--accent)] py-2 text-sm font-medium text-[var(--accent-contrast)] transition-opacity hover:opacity-80"
      >
        Unlock
      </button>
    </div>
  </div>
{/if}
