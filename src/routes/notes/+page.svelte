<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { Lightbulb, NotebookPen, Plus, Sparkles, Trash2 } from 'lucide-svelte';
  import {
    createDefaultNotesState,
    NOTES_SUPABASE_KEY,
    NOTES_STORAGE_KEY,
    parseNotesState,
    parsePersistedNotesState,
    type NotesState
  } from '$lib/notes';
  import { supabase } from '$lib/supabase';

  let notes = $state<NotesState>(createDefaultNotesState());
  let bulletDraft = $state('');
  let mounted = $state(false);
  let savedAt = $state<string | null>(null);
  let syncState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let remoteReady = $state(false);
  let hasLocalEdits = $state(false);

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
      const { error } = await supabase.from('user_preferences').upsert(
        {
          key: NOTES_SUPABASE_KEY,
          value: {
            state: payload,
            updatedAt
          },
          updated_at: updatedAt
        },
        { onConflict: 'key' }
      );

      if (error) {
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

    void (async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('value')
        .eq('key', NOTES_SUPABASE_KEY)
        .maybeSingle();

      if (error) {
        syncState = 'error';
        remoteReady = true;
        console.error('Failed to load notes sync state', error);
        return;
      }

      const persisted = parsePersistedNotesState(data?.value);
      if (persisted && !hasLocalEdits) {
        notes = persisted.state;
        savedAt = formatSavedAt(persisted.updatedAt);
        syncState = persisted.updatedAt ? 'saved' : 'idle';
      }

      remoteReady = true;
    })();

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
</script>

<svelte:head>
  <title>Notes — TaskpadSvel</title>
</svelte:head>

<div class="p-4 sm:p-6">
  <div class="mx-auto flex max-w-6xl flex-col gap-6">
    <section class="rounded-[28px] border border-zinc-200 bg-amber-50/70 px-6 py-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.3)] dark:border-zinc-800 dark:bg-amber-950/12">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="max-w-3xl">
          <div class="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700 dark:border-amber-500/20 dark:bg-white/6 dark:text-amber-300">
            <Sparkles size={12} />
            Notes Deck
          </div>
          <h1 class="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-4xl">
            Notes
          </h1>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Hızlı fikirleri, bugunun odaklarini ve daha sonra donecegin notlari tek sayfada tut. Notlar hem cihazda kalir hem de buluta senkronlanir.
          </p>
        </div>

        <div class="rounded-[24px] border border-zinc-200/80 bg-white/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/50">
          <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Autosave</div>
          <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {savedAt ?? '--:--'}
          </div>
          <div class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {workspaceWords} kelime, {bulletCount} madde
          </div>
          <div class="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-400">
            {syncLabel}
          </div>
        </div>
      </div>
    </section>

    <section class="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <article class="rounded-[28px] border border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
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
      </article>

      <div class="flex flex-col gap-5">
        <article class="rounded-[28px] border border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
          <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Today</div>
          <textarea
            value={notes.today}
            oninput={(event) => updateField('today', (event.currentTarget as HTMLTextAreaElement).value)}
            placeholder="Bugun kesin bitmesi gerekenler..."
            class="mt-4 min-h-[9rem] w-full rounded-[20px] border border-zinc-200 bg-zinc-50/75 px-4 py-3 text-sm leading-7 text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/65 dark:text-zinc-100 dark:focus:border-zinc-500"
          ></textarea>
        </article>

        <article class="rounded-[28px] border border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
          <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Next Up</div>
          <textarea
            value={notes.next}
            oninput={(event) => updateField('next', (event.currentTarget as HTMLTextAreaElement).value)}
            placeholder="Sıradaki adimlar..."
            class="mt-4 min-h-[8rem] w-full rounded-[20px] border border-zinc-200 bg-zinc-50/75 px-4 py-3 text-sm leading-7 text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/65 dark:text-zinc-100 dark:focus:border-zinc-500"
          ></textarea>
        </article>

        <article class="rounded-[28px] border border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
          <div class="flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <Lightbulb size={16} />
            Parking Lot
          </div>
          <textarea
            value={notes.parkingLot}
            oninput={(event) => updateField('parkingLot', (event.currentTarget as HTMLTextAreaElement).value)}
            placeholder="Simdi degil ama kaybolmasin dedigin seyler..."
            class="mt-4 min-h-[8rem] w-full rounded-[20px] border border-zinc-200 bg-zinc-50/75 px-4 py-3 text-sm leading-7 text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/65 dark:text-zinc-100 dark:focus:border-zinc-500"
          ></textarea>
        </article>
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
