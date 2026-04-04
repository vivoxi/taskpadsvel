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
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    role="dialog"
    aria-modal="true"
    aria-label="Password required"
  >
    <div class="bg-white dark:bg-zinc-900 rounded-lg shadow-xl p-6 w-80 flex flex-col gap-4">
      <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">Password Required</h2>
      <p class="text-sm text-zinc-500 dark:text-zinc-400">
        Enter the admin password to view and make changes.
      </p>
      <input
        type="password"
        bind:value={input}
        onkeydown={onKeydown}
        placeholder="Password"
        class="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400"
      />
      <button
        onclick={submit}
        class="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
      >
        Unlock
      </button>
    </div>
  </div>
{/if}
