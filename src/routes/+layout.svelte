<script lang="ts">
  import '../app.css';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { Toaster } from 'svelte-sonner';
  import { browser } from '$app/environment';
  import { PUBLIC_AUTH_REQUIRED } from '$env/static/public';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import PasswordModal from '$lib/components/PasswordModal.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser,
        staleTime: 1000 * 30
      }
    }
  });
</script>

<QueryClientProvider client={queryClient}>
  <div class="flex h-screen overflow-hidden bg-white dark:bg-zinc-950">
    <Sidebar />
    <main class="flex-1 overflow-auto">
      {@render children()}
    </main>
  </div>

  {#if PUBLIC_AUTH_REQUIRED === 'true'}
    <PasswordModal />
  {/if}

  <Toaster richColors position="bottom-right" />
</QueryClientProvider>
