<script lang="ts">
  import TaskList from '$lib/components/TaskList.svelte';
</script>

<svelte:head>
  <title>Random Tasks — TaskpadSvel</title>
</svelte:head>

<div class="p-6">
  <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Random Tasks</h2>
  <TaskList type="random" showResetButton />
</div>
