<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { format } from 'date-fns';
  import { CalendarRange, History, Moon, NotebookPen, Rows3, Sun } from 'lucide-svelte';
  import { getMonthKey, getWeekKey, monthLabel, weekLabel } from '$lib/planner/dates';
  import SyncStatusBadge from '$lib/components/SyncStatusBadge.svelte';
  import { themeMode, toggleTheme } from '$lib/stores/theme';

  let {
    mobile = false,
    onNavigate = () => {}
  }: {
    mobile?: boolean;
    onNavigate?: () => void;
  } = $props();

  type NavItem = {
    href: string;
    label: string;
    eyebrow: string;
    icon: typeof Rows3;
  };

  const navItems: NavItem[] = [
    { href: '/week', label: 'Week', eyebrow: weekLabel(getWeekKey()), icon: Rows3 },
    { href: '/month', label: 'Month', eyebrow: monthLabel(getMonthKey()), icon: CalendarRange },
    { href: '/history', label: 'History', eyebrow: 'Review + archive', icon: History },
    { href: '/notes', label: 'Notes', eyebrow: 'Reference', icon: NotebookPen }
  ];
</script>

<nav
  class={`shrink-0 border-r border-[var(--border)] bg-[var(--panel-soft)]/92 p-3 backdrop-blur ${
    mobile
      ? 'flex h-full w-[min(88vw,18.5rem)] flex-col shadow-[var(--shadow-soft)]'
      : 'hidden w-64 md:flex md:flex-col'
  } gap-2`}
>
  <div class="mb-2 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] px-4 py-4 shadow-[var(--shadow-card)]">
    <button
      type="button"
      onclick={() => {
        onNavigate();
        void goto('/week');
      }}
      class="text-left transition-colors duration-150 hover:text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-zinc-400"
    >
      <p class="text-[11px] font-medium uppercase tracking-[0.26em] text-[var(--text-faint)]">
        Planning System
      </p>
      <h1 class="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
        Taskpad
      </h1>
    </button>
    <p class="mt-2 text-sm leading-6 text-[var(--text-muted)]">
      Personal operations planner for recurring work, execution, and calm review.
    </p>
  </div>

  {#each navItems as item}
    {@const isActive = $page.url.pathname === item.href}
    <a
      href={item.href}
      data-sveltekit-preload-data="hover"
      aria-current={isActive ? 'page' : undefined}
      onclick={onNavigate}
      class={`flex items-start gap-3 rounded-[18px] border px-3 py-3 text-sm transition-colors duration-150 ${
        isActive
          ? 'border-[var(--border-strong)] bg-[var(--panel)] text-[var(--text-primary)] shadow-[var(--shadow-card)]'
          : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]'
      }`}
    >
      <item.icon
        size={16}
        class={isActive ? 'mt-0.5 text-[var(--text-primary)]' : 'mt-0.5 text-[var(--text-muted)]'}
      />
      <div class="min-w-0">
        <div class="font-medium tracking-[-0.01em]">{item.label}</div>
        <div class="mt-1 text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
          {item.eyebrow}
        </div>
      </div>
    </a>
  {/each}

  <div class="mt-auto space-y-3 pt-3">
    <SyncStatusBadge />

    <div class="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] px-4 py-4 text-sm text-[var(--text-muted)] shadow-[var(--shadow-card)]">
      <div class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">Current cadence</div>
      <div class="mt-2 font-medium text-[var(--text-primary)]">{format(new Date(), 'EEEE')}</div>
      <div class="mt-1 leading-6">{weekLabel(getWeekKey())}</div>
    </div>

    <button
      onclick={toggleTheme}
      class="flex w-full items-center gap-3 rounded-[16px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] shadow-[var(--shadow-card)]"
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
