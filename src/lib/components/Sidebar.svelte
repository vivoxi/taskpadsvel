<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Moon, Sun } from 'lucide-svelte';
  import {
    BarChart3,
    Calendar,
    Shuffle,
    LayoutDashboard,
    TimerReset,
    NotebookPen
  } from 'lucide-svelte';
  import { themeMode, toggleTheme } from '$lib/stores/theme';
  import { getWeekKey, getWeekDays } from '$lib/weekUtils';
  import { format } from 'date-fns';

  let {
    mobile = false,
    onNavigate = () => {}
  }: {
    mobile?: boolean;
    onNavigate?: () => void;
  } = $props();

  const weekDays = getWeekDays(getWeekKey());
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];
  const currentWeekLabel =
    weekStart.getMonth() === weekEnd.getMonth()
      ? `${format(weekStart, 'MMM d')}–${format(weekEnd, 'd')}`
      : `${format(weekStart, 'MMM d')}–${format(weekEnd, 'MMM d')}`;

  type NavItem = {
    href: string;
    label: string;
    icon: typeof BarChart3;
    eyebrow?: string;
  };

  const navItems: NavItem[] = [
    { href: '/thisweek', label: 'This Week', icon: LayoutDashboard, eyebrow: 'Home' },
    { href: '/thismonth', label: 'This Month', icon: Calendar },
    { href: '/random', label: 'Random Tasks', icon: Shuffle },
    { href: '/pomodoro', label: 'Pomodoro', icon: TimerReset },
    { href: '/notes', label: 'Notes', icon: NotebookPen },
    { href: '/dashboard', label: 'Dashboard', icon: BarChart3, eyebrow: 'Overview' }
  ];
</script>

<nav
  class={`shrink-0 border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900 ${
    mobile
      ? 'flex h-full w-[min(88vw,19rem)] flex-col border-r shadow-[0_24px_80px_-32px_rgba(15,23,42,0.55)]'
      : 'hidden w-56 border-r md:flex md:flex-col'
  } gap-1`}
>
  <div class="mb-2 border-b border-zinc-200 px-2 py-3 dark:border-zinc-800">
    <button
      type="button"
      onclick={() => {
        onNavigate();
        void goto('/thisweek');
      }}
      class="text-left transition-colors duration-150 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:hover:text-zinc-100"
    >
      <h1 class="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        TaskpadSvel
      </h1>
    </button>
    <p class="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{currentWeekLabel}</p>
  </div>

  {#each navItems as item}
    {@const isActive = $page.url.pathname === item.href}
    <a
      href={item.href}
      data-sveltekit-preload-data="hover"
      aria-current={isActive ? 'page' : undefined}
      onclick={onNavigate}
      class="flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm transition-colors duration-150
        {isActive
          ? item.href === '/thisweek'
            ? 'border-zinc-100 bg-zinc-900 font-semibold text-zinc-50 shadow-sm dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
            : 'border-zinc-300 bg-zinc-200 font-medium text-zinc-900 dark:border-zinc-300 dark:bg-zinc-800 dark:text-zinc-100'
          : item.href === '/dashboard'
            ? 'border-transparent text-zinc-400 hover:bg-zinc-100/70 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800/30 dark:hover:text-zinc-300'
            : 'border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100'}"
    >
      <item.icon size={16} />
      <div class="min-w-0">
        <div>{item.label}</div>
        {#if item.eyebrow}
          <div class={`text-[10px] uppercase tracking-[0.18em] ${
            isActive && item.href === '/thisweek'
              ? 'text-zinc-300 dark:text-zinc-700'
              : 'text-zinc-400 dark:text-zinc-500'
          }`}>
            {item.eyebrow}
          </div>
        {/if}
      </div>
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
