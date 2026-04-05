<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { Menu, X } from 'lucide-svelte';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { Toaster } from 'svelte-sonner';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { env } from '$env/dynamic/public';
  import PomodoroFloatingWidget from '$lib/components/PomodoroFloatingWidget.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import PasswordModal from '$lib/components/PasswordModal.svelte';
  import { initializePomodoroTimer } from '$lib/stores/pomodoroTimer';
  import { initializeTheme } from '$lib/stores/theme';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
  let mobileNavOpen = $state(false);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser,
        staleTime: 1000 * 30
      }
    }
  });

  onMount(() => {
    initializeTheme();
    initializePomodoroTimer();
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

<QueryClientProvider client={queryClient}>
  <div class="flex h-dvh overflow-hidden bg-white dark:bg-zinc-950">
    <Sidebar />
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-950/90">
        <button
          onclick={() => (mobileNavOpen = true)}
          class="inline-flex items-center justify-center rounded-md border border-zinc-200 p-2 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
        <a
          href="/thisweek"
          class="text-sm font-semibold tracking-tight text-zinc-900 transition-colors duration-150 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          TaskpadSvel
        </a>
        <div class="h-10 w-10"></div>
      </header>

      <main class="min-h-0 flex-1 overflow-auto">
        {@render children()}
      </main>
    </div>
  </div>

  {#if mobileNavOpen}
    <div class="fixed inset-0 z-40 md:hidden">
      <button
        class="absolute inset-0 bg-zinc-950/55 backdrop-blur-[2px]"
        aria-label="Close navigation"
        onclick={() => (mobileNavOpen = false)}
      ></button>
      <div class="relative h-full">
        <div class="absolute left-0 top-0 flex h-full">
          <Sidebar mobile onNavigate={() => (mobileNavOpen = false)} />
        </div>
        <button
          onclick={() => (mobileNavOpen = false)}
          class="absolute right-4 top-4 inline-flex items-center justify-center rounded-full border border-white/15 bg-zinc-900/80 p-2 text-white shadow-lg"
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

  <Toaster richColors position="bottom-right" />
  {#if $page.url.pathname !== '/pomodoro'}
    <PomodoroFloatingWidget />
  {/if}
</QueryClientProvider>
