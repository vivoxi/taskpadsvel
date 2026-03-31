<script lang="ts">
  import { page } from '$app/stores';
  import {
    CalendarDays,
    Calendar,
    Shuffle,
    LayoutDashboard
  } from 'lucide-svelte';

  const navItems = [
    { href: '/weekly', label: 'Weekly Tasks', icon: CalendarDays },
    { href: '/monthly', label: 'Monthly Tasks', icon: Calendar },
    { href: '/random', label: 'Random Tasks', icon: Shuffle },
    { href: '/thisweek', label: 'This Week', icon: LayoutDashboard }
  ] as const;
</script>

<nav class="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex flex-col p-3 gap-1">
  <div class="px-2 py-3 mb-2">
    <h1 class="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
      TaskpadSvel
    </h1>
  </div>

  {#each navItems as item}
    {@const isActive = $page.url.pathname === item.href}
    <a
      href={item.href}
      class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors
        {isActive
          ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'}"
    >
      <svelte:component this={item.icon} size={16} />
      {item.label}
    </a>
  {/each}
</nav>
