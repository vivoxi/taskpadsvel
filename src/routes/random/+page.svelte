<script lang="ts">
  import RandomTaskBoard from '$lib/components/RandomTaskBoard.svelte';
</script>

<svelte:head>
  <title>Random Tasks — TaskpadSvel</title>
</svelte:head>

<div class="p-4 sm:p-6">
  <div class="mx-auto flex max-w-5xl flex-col gap-6">
    <div class="flex items-center gap-3">
      <h1 class="text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Random Tasks</h1>
      <span class="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">Flexible Board</span>
    </div>

    <section class="rounded-[28px] border border-zinc-200 bg-white/92 px-4 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/88">
      <RandomTaskBoard />
    </section>
  </div>
</div>
