<script lang="ts">
  import { page } from '$app/stores';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import {
    CalendarDays, Rows3, NotebookPen
  } from 'lucide-svelte';

  let {
    mobile = false,
    onNavigate = () => {}
  }: { mobile?: boolean; onNavigate?: () => void } = $props();

  const nav = [
    { href: '/dashboard', label: 'Calendar', icon: CalendarDays },
    { href: '/week',      label: 'Week',     icon: Rows3        },
    { href: '/notes',     label: 'Notes',    icon: NotebookPen  }
  ];
</script>

<nav
  class={`shrink-0 border-r border-[var(--border)] bg-[var(--panel-soft)] p-2.5 ${mobile ? 'h-full w-64' : 'hidden w-56 md:flex'} flex flex-col`}
>
  <div class="mb-2 px-3 py-4">
    <a
      href="/dashboard"
      onclick={onNavigate}
      class="text-sm font-semibold tracking-[-0.02em] text-[var(--text-primary)] no-underline"
    >
      Taskpad
    </a>
    <p class="mt-1 text-xs text-[var(--text-faint)]">Calendar-first planning workspace</p>
  </div>

  <div class="space-y-1">
    {#each nav as item}
      {@const active = $page.url.pathname === item.href}
      <a
        href={item.href}
        onclick={onNavigate}
        aria-current={active ? 'page' : undefined}
        data-sveltekit-preload-data="hover"
        class={[
          'flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm no-underline transition-colors',
          active
            ? 'bg-[var(--panel)] font-medium text-[var(--text-primary)] shadow-[inset_2px_0_0_var(--accent)]'
            : 'text-[var(--text-muted)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]'
        ].join(' ')}
      >
        <item.icon size={15} />
        {item.label}
      </a>
    {/each}
  </div>

  <div class="mt-auto space-y-3 px-1 pb-2 pt-6">
    <div class="px-2">
      <Badge>Advanced surfaces via command palette</Badge>
    </div>
    <Button href="/planner" variant="ghost" size="sm" className="w-full justify-start" onclick={onNavigate}>
      Advanced Planner
    </Button>
    <Button href="/history" variant="ghost" size="sm" className="w-full justify-start" onclick={onNavigate}>
      History
    </Button>
  </div>
</nav>
