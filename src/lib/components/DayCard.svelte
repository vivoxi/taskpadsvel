<script lang="ts">
  import { supabase } from '$lib/supabase';
  import { debounce } from '$lib/debounce';
  import { toast } from 'svelte-sonner';

  let {
    weekKey,
    day,
    dateLabel = '',
    initialContent = '',
    isToday = false,
    readonly = false
  }: {
    weekKey: string;
    day: string;
    dateLabel?: string;
    initialContent?: string;
    isToday?: boolean;
    readonly?: boolean;
  } = $props();

  let content = $state('');

  $effect(() => {
    content = initialContent;
  });

  const saveContent = debounce(async (weekKeyValue: string, dayValue: string, value: string) => {
    const { error } = await supabase.from('weekly_plan').upsert(
      { week_key: weekKeyValue, day: dayValue, content: value },
      { onConflict: 'week_key,day' }
    );
    if (error) toast.error('Failed to save planner note');
  }, 500);

  function onInput(e: Event) {
    content = (e.target as HTMLTextAreaElement).value;
    saveContent(weekKey, day, content);
  }
</script>

<div
  class="flex flex-col rounded-lg border p-3 gap-2
    {isToday
      ? 'border-blue-400 dark:border-blue-500 bg-blue-50/30 dark:bg-blue-950/20'
      : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900'}"
>
  <div class="flex items-center gap-2">
    <span class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
      {day}
    </span>
    {#if dateLabel}
      <span class="text-xs text-zinc-400 dark:text-zinc-500">
        {dateLabel}
      </span>
    {/if}
    {#if isToday}
      <span class="text-xs text-blue-500 font-medium">Today</span>
    {/if}
  </div>
  <textarea
    value={content}
    oninput={onInput}
    disabled={readonly}
    placeholder="Notes for {day}…"
    rows={4}
    class="w-full bg-transparent text-sm text-zinc-700 dark:text-zinc-300 resize-none outline-none placeholder:text-zinc-400 disabled:opacity-60"
  ></textarea>
</div>
