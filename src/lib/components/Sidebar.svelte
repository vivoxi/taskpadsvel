<script lang="ts">
  import { page } from '$app/stores';
  import { Moon, Sun } from 'lucide-svelte';
  import {
    BarChart3,
    CalendarDays,
    Calendar,
    Shuffle,
    LayoutDashboard,
    TimerReset,
    NotebookPen
  } from 'lucide-svelte';
  import { themeMode, toggleTheme } from '$lib/stores/theme';

  let {
    mobile = false,
    onNavigate = () => {}
  }: {
    mobile?: boolean;
    onNavigate?: () => void;
  } = $props();

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
    { href: '/thisweek', label: 'This Week', icon: LayoutDashboard },
    { href: '/pomodoro', label: 'Pomodoro', icon: TimerReset },
    { href: '/notes', label: 'Notes', icon: NotebookPen },
    { href: '/weekly', label: 'Weekly Tasks', icon: CalendarDays },
    { href: '/monthly', label: 'Monthly Tasks', icon: Calendar },
    { href: '/random', label: 'Random Tasks', icon: Shuffle }
  ] as const;
</script>

<nav
  class={`shrink-0 border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900 ${
    mobile
      ? 'flex h-full w-[min(88vw,19rem)] flex-col border-r shadow-[0_24px_80px_-32px_rgba(15,23,42,0.55)]'
      : 'hidden w-56 border-r md:flex md:flex-col'
  } gap-1`}
>
  <div class="px-2 py-3 mb-2">
    <h1 class="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
      TaskpadSvel
    </h1>
  </div>

  {#each navItems as item}
    {@const isActive = $page.url.pathname === item.href}
    <a
      href={item.href}
      onclick={onNavigate}
      class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors
        {isActive
          ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'}"
    >
      <item.icon size={16} />
      {item.label}
    </a>
  {/each}

  <div class="mt-auto pt-3">
    <button
      onclick={toggleTheme}
      class="flex w-full items-center gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      aria-label={$themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {#if $themeMode === 'dark'}
        <Sun size={16} />
        Light Mode
      {:else}
        <Moon size={16} />
        Dark Mode
      {/if}
    </button>
  </div>
</nav>
