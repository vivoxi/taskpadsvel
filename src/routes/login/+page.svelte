<script lang="ts">
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
  <title>Sign in · Taskpad</title>
</svelte:head>

<div
  style="
    min-height:100dvh; display:flex; align-items:center; justify-content:center;
    background:var(--bg); padding:24px;
  "
>
  <div
    style="
      width:min(100%, 340px);
      background:var(--panel);
      border:1px solid var(--border-strong);
      border-radius:12px;
      padding:28px 24px;
      display:flex; flex-direction:column; gap:20px;
    "
  >
    <div style="display:flex; flex-direction:column; gap:4px;">
      <h1
        style="font-size:15px; font-weight:600; color:var(--text-primary); margin:0;
               letter-spacing:-0.02em;"
      >
        Taskpad
      </h1>
      <p style="font-size:13px; color:var(--text-muted); margin:0; line-height:1.5;">
        Enter your admin password to continue.
      </p>
    </div>

    <form method="POST" style="display:flex; flex-direction:column; gap:12px;">
      {#if form?.error}
        <p
          style="
            font-size:12px; color:#ef4444; margin:0;
            background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2);
            border-radius:6px; padding:8px 10px;
          "
        >
          {form.error}
        </p>
      {/if}

      <input
        type="password"
        name="password"
        placeholder="Password"
        style="
          width:100%; background:var(--panel-soft); color:var(--text-primary);
          border:1px solid var(--border); border-radius:6px;
          padding:8px 10px; font-size:13px; outline:none;
          transition:border-color 150ms ease; box-sizing:border-box;
        "
      />

      <button
        type="submit"
        style="
          width:100%; background:var(--accent); color:#fff;
          border:none; padding:9px 14px;
          border-radius:6px; font-size:13px; font-weight:500;
          cursor:pointer; transition:opacity 150ms ease;
        "
      >
        Unlock
      </button>
    </form>
  </div>
</div>
