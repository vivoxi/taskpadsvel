<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { Menu, X } from 'lucide-svelte';
  import { Toaster } from 'svelte-sonner';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import { initializeTheme } from '$lib/stores/theme';
  import { commandPaletteOpen } from '$lib/stores';
  import type { LayoutData } from './$types';
  import type { Snippet } from 'svelte';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();
  let mobileNavOpen = $state(false);

  onMount(() => {
    initializeTheme();
  });

</script>

<svelte:head>
  <script>
    (() => {
      document.documentElement.style.colorScheme = 'dark';
    })();
  </script>
</svelte:head>

<div class="flex h-dvh overflow-hidden bg-[var(--bg)]">
  <Sidebar />
  <div class="flex min-w-0 flex-1 flex-col">
    <header class="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3 md:hidden">
      <button
        onclick={() => (mobileNavOpen = true)}
        class="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel)] p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        aria-label="Open navigation"
      >
        <Menu size={16} />
      </button>
      <a
        href="/dashboard"
        style="font-size:13px;font-weight:600;letter-spacing:-0.02em;color:var(--text-primary);text-decoration:none"
      >
        Taskpad
      </a>
      <button
        type="button"
        style="
          display:inline-flex; align-items:center; gap:6px;
          padding:4px 10px; border-radius:6px;
          border:1px solid var(--border);
          font-size:11px; color:var(--text-muted);
          background:transparent; cursor:pointer;
        "
        onclick={() => commandPaletteOpen.set(true)}
      >
        Search
      </button>
    </header>

    <div class="hidden items-center justify-end px-5 py-2.5 border-b border-[var(--border)] bg-[var(--panel-soft)] md:flex">
      <button
        type="button"
        onclick={() => commandPaletteOpen.set(true)}
        style="
          display:flex; align-items:center; gap:8px;
          padding:5px 12px; border-radius:6px;
          border:1px solid var(--border);
          font-size:12px; color:var(--text-muted);
          background:transparent; cursor:pointer;
          transition:border-color 150ms ease;
        "
      >
        Search
        <span style="font-size:10px;color:var(--text-faint)">⌘K</span>
      </button>
    </div>

    <main class="min-h-0 flex-1 overflow-auto">
      {@render children()}
    </main>
  </div>
</div>

{#if mobileNavOpen}
  <div class="fixed inset-0 z-40 md:hidden">
    <button
      class="absolute inset-0 bg-black/50"
      aria-label="Close navigation"
      onclick={() => (mobileNavOpen = false)}
    ></button>
    <div class="relative h-full">
      <div class="absolute left-0 top-0 flex h-full">
        <Sidebar mobile onNavigate={() => (mobileNavOpen = false)} />
      </div>
      <button
        onclick={() => (mobileNavOpen = false)}
        class="absolute right-4 top-4 inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel)] p-2 text-[var(--text-secondary)]"
        aria-label="Close navigation"
      >
        <X size={16} />
      </button>
    </div>
  </div>
{/if}

<Toaster theme="dark" position="bottom-right" />
<ConfirmModal />
<CommandPalette />
