<script lang="ts">
  import { page } from '$app/stores';
  import {
    CalendarDays, Rows3, NotebookPen,
    CalendarRange, History
  } from 'lucide-svelte';

  let {
    mobile = false,
    onNavigate = () => {}
  }: { mobile?: boolean; onNavigate?: () => void } = $props();

  const nav = [
    { href: '/dashboard', label: 'Calendar', icon: CalendarDays },
    { href: '/week',      label: 'Week',     icon: Rows3        },
    { href: '/notes',     label: 'Notes',    icon: NotebookPen  },
    { href: '/planner',   label: 'Planner',  icon: CalendarRange},
    { href: '/history',   label: 'History',  icon: History      },
  ];
</script>

<nav
  class="shrink-0 border-r border-[var(--border)] flex flex-col p-2 gap-0.5
         {mobile ? 'h-full w-64' : 'hidden w-48 md:flex'}"
  style="background: var(--panel-soft)"
>
  <div class="px-3 py-4 mb-1">
    <a
      href="/dashboard"
      onclick={onNavigate}
      style="font-size:14px;font-weight:600;color:var(--text-primary);letter-spacing:-0.02em;text-decoration:none"
    >
      Taskpad
    </a>
  </div>

  {#each nav as item}
    {@const active = $page.url.pathname === item.href}
    <a
      href={item.href}
      onclick={onNavigate}
      aria-current={active ? 'page' : undefined}
      data-sveltekit-preload-data="hover"
      class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md no-underline transition-all duration-150"
      style="
        font-size:13px;
        font-weight:{active ? '500' : '400'};
        color:{active ? 'var(--text-primary)' : 'var(--text-muted)'};
        background:{active ? 'var(--panel)' : 'transparent'};
        text-decoration:none;
      "
    >
      <item.icon size={14} />
      {item.label}
    </a>
  {/each}
</nav>
