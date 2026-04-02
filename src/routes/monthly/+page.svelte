<script lang="ts">
  import TaskList from '$lib/components/TaskList.svelte';
</script>

<svelte:head>
  <title>Monthly Tasks — TaskpadSvel</title>
</svelte:head>

<div class="p-4 sm:p-6">
  <div class="mx-auto flex max-w-5xl flex-col gap-6">
    <section class="rounded-[28px] border border-zinc-200 bg-sky-50/70 px-6 py-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.3)] dark:border-zinc-800 dark:bg-sky-950/12">
      <div class="inline-flex items-center rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:border-sky-500/20 dark:bg-white/6 dark:text-sky-300">
        Monthly Templates
      </div>
      <h1 class="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Monthly Tasks
      </h1>
      <p class="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Burası sadece her ay tekrar eden iş şablonlarını yönetmek için. Saat, preferred week ve
        preferred day gir; ay bazlı takip ve arşiv `This Month` ekranında.
      </p>
    </section>

    <section class="rounded-[28px] border border-zinc-200 bg-white/92 px-4 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/88">
      <TaskList type="monthly" templateMode={true} />
    </section>
  </div>
</div>
