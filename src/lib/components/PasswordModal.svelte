<script lang="ts">
  import { authPassword } from '$lib/stores';

  let input = $state('');

  function submit() {
    if (input.trim()) {
      authPassword.set(input.trim());
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') submit();
  }
</script>

{#if !$authPassword}
  <div
    style="
      position:fixed; inset:0; z-index:50;
      display:flex; align-items:center; justify-content:center;
      background:rgba(0,0,0,0.65); backdrop-filter:blur(2px);
    "
    role="dialog"
    aria-modal="true"
    aria-labelledby="password-modal-title"
  >
    <div
      style="
        width:min(90vw, 340px);
        background:var(--panel);
        border:1px solid var(--border-strong);
        border-radius:12px;
        padding:24px;
        display:flex; flex-direction:column; gap:16px;
      "
    >
      <h2
        id="password-modal-title"
        style="font-size:14px;font-weight:500;color:var(--text-primary);margin:0"
      >
        Password Required
      </h2>
      <p style="font-size:13px;color:var(--text-muted);margin:0;line-height:1.5">
        Enter the admin password to view and make changes.
      </p>
      <input
        type="password"
        bind:value={input}
        onkeydown={onKeydown}
        placeholder="Password"
        style="
          width:100%; background:var(--panel-soft); color:var(--text-primary);
          border:1px solid var(--border); border-radius:6px;
          padding:7px 10px; font-size:13px; outline:none;
          transition:border-color 150ms ease; box-sizing:border-box;
        "
      />
      <button
        onclick={submit}
        style="
          width:100%; background:var(--accent); color:#fff;
          border:none; padding:8px 14px;
          border-radius:6px; font-size:13px; font-weight:500;
          cursor:pointer; transition:background 150ms ease;
        "
      >
        Unlock
      </button>
    </div>
  </div>
{/if}
