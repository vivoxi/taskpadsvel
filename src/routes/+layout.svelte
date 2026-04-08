<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { Menu, X } from 'lucide-svelte';
  import { Toaster } from 'svelte-sonner';
  import { page } from '$app/stores';
  import { env } from '$env/dynamic/public';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import PasswordModal from '$lib/components/PasswordModal.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import SyncStatusBadge from '$lib/components/SyncStatusBadge.svelte';
  import { initializeTheme } from '$lib/stores/theme';
  import { commandPaletteOpen } from '$lib/stores';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
  let mobileNavOpen = $state(false);

  onMount(() => {
    initializeTheme();
  });

  const authRequired = $derived(env.PUBLIC_AUTH_REQUIRED === 'true');
</script>

<svelte:head>
  <script>
    (() => {
      const stored = localStorage.getItem('taskpad-theme');
      const mode =
        stored === 'light' || stored === 'dark'
          ? stored
          : window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
      document.documentElement.classList.toggle('dark', mode === 'dark');
      document.documentElement.style.colorScheme = mode;
    })();
  </script>
</svelte:head>

<div class="flex h-dvh overflow-hidden bg-[var(--background)]">
  <Sidebar />
  <div class="flex min-w-0 flex-1 flex-col">
    <header class="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/94 px-4 py-3 backdrop-blur md:hidden">
      <button
        onclick={() => (mobileNavOpen = true)}
        class="inline-flex items-center justify-center rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-2 text-[var(--text-secondary)] shadow-[var(--shadow-card)] transition-colors hover:text-[var(--text-primary)]"
        aria-label="Open navigation"
      >
        <Menu size={18} />
      </button>
      <a
        href="/dashboard"
        class="text-sm font-semibold tracking-[-0.02em] text-[var(--text-primary)] transition-colors duration-150 hover:text-[var(--text-secondary)]"
      >
        Taskpad
      </a>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--text-secondary)]"
        onclick={() => commandPaletteOpen.set(true)}
      >
        Search
      </button>
    </header>

    <div class="hidden items-center justify-end gap-3 border-b border-[var(--border)] bg-[var(--background)]/92 px-6 py-3 backdrop-blur md:flex">
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        onclick={() => commandPaletteOpen.set(true)}
      >
        Search
        <span class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-faint)]">⌘K</span>
      </button>
      <SyncStatusBadge />
    </div>

    <main class="min-h-0 flex-1 overflow-auto">
      {@render children()}
    </main>
  </div>
</div>

{#if mobileNavOpen}
  <div class="fixed inset-0 z-40 md:hidden">
    <button
      class="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
      aria-label="Close navigation"
      onclick={() => (mobileNavOpen = false)}
    ></button>
    <div class="relative h-full">
      <div class="absolute left-0 top-0 flex h-full">
        <Sidebar mobile onNavigate={() => (mobileNavOpen = false)} />
      </div>
      <button
        onclick={() => (mobileNavOpen = false)}
        class="absolute right-4 top-4 inline-flex items-center justify-center rounded-full border border-white/10 bg-zinc-950/80 p-2 text-white shadow-lg"
        aria-label="Close navigation"
      >
        <X size={18} />
      </button>
    </div>
  </div>
{/if}

{#if authRequired}
  <PasswordModal />
{/if}

<Toaster theme="light" position="bottom-right" />
<CommandPalette />
{#if $page.url.pathname.startsWith('/notes')}
  <div class="pointer-events-none fixed inset-x-0 bottom-0 h-24 bg-linear-to-t from-[var(--background)] to-transparent"></div>
{/if}
