<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { ChevronDown, PanelRightClose, PanelRightOpen } from 'lucide-svelte';
  import type { Snippet } from 'svelte';

  const PANEL_MIN = 280;
  const PANEL_DEFAULT = 360;
  const PANEL_MAX = 520;

  let {
    title = 'Planner',
    main,
    panel,
    mobilePanel
  }: {
    title?: string;
    main: Snippet;
    panel: Snippet;
    mobilePanel?: Snippet;
  } = $props();

  let plannerPanelOpen = $state(true);
  let plannerPanelWidth = $state(PANEL_DEFAULT);
  let resizingPlannerPanel = $state(false);
  let desktopLayout = $state(false);
  let panelPrefsReady = false;

  onMount(() => {
    const syncDesktopMode = () => {
      desktopLayout = window.innerWidth >= 1280;
    };

    syncDesktopMode();

    const savedOpen = localStorage.getItem('taskpad-planner-panel-open');
    if (savedOpen === 'true' || savedOpen === 'false') {
      plannerPanelOpen = savedOpen === 'true';
    }

    const savedWidth = Number(localStorage.getItem('taskpad-planner-panel-width'));
    if (Number.isFinite(savedWidth)) {
      plannerPanelWidth = clampPlannerPanelWidth(savedWidth);
    }

    panelPrefsReady = true;
    window.addEventListener('resize', syncDesktopMode);

    return () => {
      window.removeEventListener('resize', syncDesktopMode);
      stopPlannerResize();
    };
  });

  $effect(() => {
    if (!browser || !panelPrefsReady) return;
    localStorage.setItem('taskpad-planner-panel-open', plannerPanelOpen ? 'true' : 'false');
    localStorage.setItem('taskpad-planner-panel-width', String(plannerPanelWidth));
  });

  const desktopGridStyle = $derived(
    desktopLayout
      ? `grid-template-columns: minmax(0, 1fr) ${plannerPanelOpen ? `${plannerPanelWidth}px` : '0px'};`
      : ''
  );

  const desktopPlannerStyle = $derived(
    desktopLayout && !plannerPanelOpen
      ? 'width:0;min-width:0;opacity:0;pointer-events:none;overflow:hidden;'
      : ''
  );

  function clampPlannerPanelWidth(value: number) {
    return Math.min(PANEL_MAX, Math.max(PANEL_MIN, value));
  }

  function togglePlannerPanel() {
    plannerPanelOpen = !plannerPanelOpen;
  }

  function startPlannerResize(event: MouseEvent) {
    if (!desktopLayout || !plannerPanelOpen) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = plannerPanelWidth;
    resizingPlannerPanel = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      plannerPanelWidth = clampPlannerPanelWidth(startWidth + delta);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      stopPlannerResize();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function stopPlannerResize() {
    if (!browser) return;
    resizingPlannerPanel = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
</script>

<div class="grid items-start gap-4 xl:gap-0" style={desktopGridStyle}>
  <div class="min-w-0">
    <div class="mb-4 xl:hidden">
      <div class="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <button
          type="button"
          class="flex w-full items-center justify-between px-4 py-3 text-left"
          onclick={togglePlannerPanel}
        >
          <div>
            <div class="text-sm font-medium text-[var(--text-primary)]">{title}</div>
            <div class="mt-1 text-xs text-[var(--text-muted)]">
              Templates, capacity, generate and reset
            </div>
          </div>
          <ChevronDown
            size={16}
            class={`text-[var(--text-faint)] transition-transform ${plannerPanelOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {#if plannerPanelOpen}
          <div class="border-t border-[var(--border)] p-3">
            {@render (mobilePanel ?? panel)()}
          </div>
        {/if}
      </div>
    </div>

    {@render main()}
  </div>

  <div class="relative hidden xl:block">
    {#if plannerPanelOpen}
      <button
        type="button"
        class={`absolute left-0 top-1/2 z-10 h-24 w-3 -translate-x-1/2 -translate-y-1/2 cursor-col-resize rounded-full border border-[var(--border)] bg-[var(--panel)]/95 text-[var(--text-faint)] transition-colors hover:text-[var(--text-primary)] ${resizingPlannerPanel ? 'text-[var(--accent)]' : ''}`}
        onmousedown={startPlannerResize}
        aria-label="Resize planner panel"
        title="Drag to resize planner panel"
      ></button>
    {/if}

    <div class="min-w-0 xl:pl-4" style={desktopPlannerStyle}>
      <div class="mb-3 flex items-center justify-end">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          onclick={togglePlannerPanel}
        >
          <PanelRightClose size={14} />
          Collapse
        </button>
      </div>

      <div class="xl:sticky xl:top-4">
        {@render panel()}
      </div>
    </div>
  </div>
</div>

{#if desktopLayout && !plannerPanelOpen}
  <button
    type="button"
    class="fixed right-4 top-1/2 z-20 hidden -translate-y-1/2 items-center gap-2 rounded-l-full rounded-r-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-secondary)] shadow-[0_12px_24px_rgba(0,0,0,0.22)] transition-colors hover:text-[var(--text-primary)] xl:inline-flex"
    onclick={togglePlannerPanel}
  >
    <PanelRightOpen size={15} />
    {title}
  </button>
{/if}
