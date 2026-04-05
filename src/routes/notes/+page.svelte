<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { Lightbulb, NotebookPen, Plus, Trash2 } from 'lucide-svelte';
  import { apiJson, apiSendJson, canUseClientApi } from '$lib/client/api';
  import { Card, PageTitle, SectionHeader } from '$lib/components/ui';
  import {
    createDefaultNotesState,
    NOTES_SUPABASE_KEY,
    NOTES_STORAGE_KEY,
    parseNotesState,
    parsePersistedNotesState,
    type NotesState
  } from '$lib/notes';
  import { authPassword } from '$lib/stores';

  let notes = $state<NotesState>(createDefaultNotesState());
  let bulletDraft = $state('');
  let mounted = $state(false);
  let savedAt = $state<string | null>(null);
  let syncState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let remoteReady = $state(false);
  let hasLocalEdits = $state(false);
  const canAccessApi = $derived(canUseClientApi($authPassword));

  const bulletCount = $derived(notes.bullets.length);
  const workspaceWords = $derived(
    notes.workspace
      .trim()
      .split(/\s+/)
      .filter(Boolean).length
  );
  const syncLabel = $derived(
    syncState === 'error' ? 'Sync error' : 'Cloud backup on'
  );

  let remoteSaveTimer: ReturnType<typeof setTimeout> | null = null;

  function formatSavedAt(value: string | null): string | null {
    if (!value) return null;

    return new Date(value).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function buildNotesPayload(): NotesState {
    return {
      workspace: notes.workspace,
      today: notes.today,
      next: notes.next,
      parkingLot: notes.parkingLot,
      bullets: [...notes.bullets]
    };
  }

  function persistLocalState() {
    if (!browser || !mounted) return;
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(buildNotesPayload()));
    savedAt = formatSavedAt(new Date().toISOString());
  }

  function scheduleRemoteSave() {
    if (!browser || !mounted || !remoteReady) return;

    const payload = buildNotesPayload();
    const updatedAt = new Date().toISOString();
    syncState = 'saving';

    if (remoteSaveTimer) clearTimeout(remoteSaveTimer);
    remoteSaveTimer = setTimeout(async () => {
      try {
        await apiSendJson('/api/preferences', 'POST', {
          key: NOTES_SUPABASE_KEY,
          value: {
            state: payload,
            updatedAt
          },
          updatedAt
        });
      } catch (error) {
        syncState = 'error';
        console.error('Failed to sync notes', error);
        return;
      }

      savedAt = formatSavedAt(updatedAt);
      syncState = 'saved';
    }, 500);
  }

  function updateField(field: keyof Omit<NotesState, 'bullets'>, value: string) {
    hasLocalEdits = true;
    notes = {
      ...notes,
      [field]: value
    };
  }

  function addBullet() {
    const nextBullet = bulletDraft.trim();
    if (!nextBullet) return;

    hasLocalEdits = true;
    notes = {
      ...notes,
      bullets: [...notes.bullets, nextBullet]
    };
    bulletDraft = '';
  }

  function deleteBullet(index: number) {
    hasLocalEdits = true;
    notes = {
      ...notes,
      bullets: notes.bullets.filter((_, itemIndex) => itemIndex !== index)
    };
  }

  function handleBulletKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addBullet();
    }
  }

  onMount(() => {
    mounted = true;

    try {
      notes = parseNotesState(localStorage.getItem(NOTES_STORAGE_KEY));
    } catch {
      notes = createDefaultNotesState();
    }

    persistLocalState();

    return () => {
      if (remoteSaveTimer) clearTimeout(remoteSaveTimer);
    };
  });

  $effect(() => {
    if (!mounted) return;
    persistLocalState();
    if (remoteReady) scheduleRemoteSave();
  });

  $effect(() => {
    if (!mounted || remoteReady || !canAccessApi) return;

    apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
      `/api/preferences?key=${encodeURIComponent(NOTES_SUPABASE_KEY)}`
    )
      .then((response) => {
        const persisted = parsePersistedNotesState(response.entries[0]?.value);
        if (persisted && !hasLocalEdits) {
          notes = persisted.state;
          savedAt = formatSavedAt(persisted.updatedAt);
          syncState = persisted.updatedAt ? 'saved' : 'idle';
        }
      })
      .catch((error) => {
        syncState = 'error';
        console.error('Failed to load notes sync state', error);
      })
      .finally(() => {
        remoteReady = true;
      });
  });
</script>

<svelte:head>
  <title>Notes — TaskpadSvel</title>
</svelte:head>

<div class="p-4 sm:p-6">
  <div class="mx-auto flex max-w-6xl flex-col gap-6">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <PageTitle class="text-zinc-950 dark:text-zinc-50">Notes</PageTitle>
        <span class="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">Support Space</span>
      </div>
      <div class="flex items-center gap-3 text-sm text-zinc-400 dark:text-zinc-500">
        <span>{workspaceWords} kelime · {bulletCount} madde</span>
        <span class="text-xs uppercase tracking-[0.16em]">{savedAt ? `Saved ${savedAt}` : syncLabel}</span>
      </div>
    </div>

    <div class="rounded-[22px] border border-zinc-200 bg-white/80 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/65 dark:text-zinc-400">
      This Week gunluk planlamayi sahiplenir. Notes ise dusunce, referans ve uzun form capture alani olarak kalir.
    </div>

    <section class="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <Card class="rounded-[28px] border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
        <div class="flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          <NotebookPen size={16} />
          Workspace Note
        </div>
        <textarea
          value={notes.workspace}
          oninput={(event) => updateField('workspace', (event.currentTarget as HTMLTextAreaElement).value)}
          placeholder="Uzun notlarini, toplantı ozetlerini veya daginik dusuncelerini buraya birak..."
          class="mt-4 min-h-[28rem] w-full rounded-[24px] border border-zinc-200 bg-zinc-50/75 px-4 py-4 text-sm leading-7 text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/65 dark:text-zinc-100 dark:focus:border-zinc-500"
        ></textarea>
      </Card>

      <div class="flex flex-col gap-5">
        <Card class="rounded-[28px] border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
          <SectionHeader>Thoughts Today</SectionHeader>
          <p class="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Gunluk dusunceler ve baglam. Gorev plani icin degil.</p>
          <textarea
            value={notes.today}
            oninput={(event) => updateField('today', (event.currentTarget as HTMLTextAreaElement).value)}
            placeholder="Bugun aklina gelenler, dusunceler, baglantilar, toplanti notlari..."
            class="mt-4 min-h-[9rem] w-full rounded-[20px] border border-zinc-200 bg-zinc-50/75 px-4 py-3 text-sm leading-7 text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/65 dark:text-zinc-100 dark:focus:border-zinc-500"
          ></textarea>
        </Card>

        <Card class="rounded-[28px] border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
          <SectionHeader>Next Up</SectionHeader>
          <p class="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Yakinda bakmak istedigin seyler
          </p>
          <textarea
            value={notes.next}
            oninput={(event) => updateField('next', (event.currentTarget as HTMLTextAreaElement).value)}
            placeholder="Sıradaki adimlar..."
            class="mt-4 min-h-[8rem] w-full rounded-[20px] border border-zinc-200 bg-zinc-50/75 px-4 py-3 text-sm leading-7 text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/65 dark:text-zinc-100 dark:focus:border-zinc-500"
          ></textarea>
        </Card>

        <Card class="rounded-[28px] border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
          <div class="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Lightbulb size={16} />
            <SectionHeader>Parking Lot</SectionHeader>
          </div>
          <p class="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Simdi degil ama unutmayacagin seyler
          </p>
          <textarea
            value={notes.parkingLot}
            oninput={(event) => updateField('parkingLot', (event.currentTarget as HTMLTextAreaElement).value)}
            placeholder="Simdi degil ama kaybolmasin dedigin seyler..."
            class="mt-4 min-h-[8rem] w-full rounded-[20px] border border-zinc-200 bg-zinc-50/75 px-4 py-3 text-sm leading-7 text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/65 dark:text-zinc-100 dark:focus:border-zinc-500"
          ></textarea>
        </Card>
      </div>
    </section>

    <section class="rounded-[28px] border border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Quick Bullets</div>
          <div class="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
            Hızlı capture listesi
          </div>
        </div>
      </div>

      <div class="mt-5 flex flex-wrap gap-2">
        <input
          type="text"
          bind:value={bulletDraft}
          onkeydown={handleBulletKeydown}
          placeholder="Yeni madde ekle... (Enter)"
          class="min-w-[18rem] flex-1 rounded-[18px] border border-zinc-200 bg-zinc-50/75 px-4 py-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/65 dark:text-zinc-100 dark:focus:border-zinc-500"
        />
        <button
          onclick={addBullet}
          class="inline-flex items-center gap-2 rounded-[18px] bg-zinc-950 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-300"
        >
          <Plus size={15} />
          Add
        </button>
      </div>

      {#if notes.bullets.length === 0}
        <div class="mt-5 rounded-[20px] border border-dashed border-zinc-300 px-4 py-5 text-sm text-zinc-400 dark:border-zinc-700">
          Henuz quick bullet yok.
        </div>
      {:else}
        <div class="mt-5 grid gap-3 md:grid-cols-2">
          {#each notes.bullets as bullet, index (`${bullet}-${index}`)}
            <article class="flex items-start gap-3 rounded-[20px] border border-zinc-200 bg-zinc-50/75 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400"></div>
              <div class="min-w-0 flex-1 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
                {bullet}
              </div>
              <button
                onclick={() => deleteBullet(index)}
                class="rounded-md p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                aria-label="Delete note bullet"
              >
                <Trash2 size={14} />
              </button>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>
