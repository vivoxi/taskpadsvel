<script lang="ts">
  import { confirmState } from '$lib/stores/confirm';

  function handleConfirm() {
    $confirmState.resolve(true);
    confirmState.update((s) => ({ ...s, open: false }));
  }

  function handleCancel() {
    $confirmState.resolve(false);
    confirmState.update((s) => ({ ...s, open: false }));
  }

  function onBackdropKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleCancel();
  }
</script>

{#if $confirmState.open}
  <div
    style="
      position:fixed; inset:0; z-index:50;
      display:flex; align-items:center; justify-content:center;
      background:rgba(0,0,0,0.65); backdrop-filter:blur(2px);
    "
    role="presentation"
    onkeydown={onBackdropKeydown}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
      style="
        width:min(90vw, 360px);
        background:var(--panel);
        border:1px solid var(--border-strong);
        border-radius:12px;
        padding:24px;
      "
    >
      <h2
        id="confirm-modal-title"
        style="font-size:14px;font-weight:500;color:var(--text-primary);margin:0 0 8px"
      >
        {$confirmState.title}
      </h2>
      <p
        id="confirm-modal-desc"
        style="font-size:13px;color:var(--text-muted);margin:0 0 20px;line-height:1.5"
      >
        {$confirmState.message}
      </p>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button
          onclick={handleCancel}
          style="
            background:transparent; color:var(--text-secondary);
            border:1px solid var(--border); padding:5px 12px;
            border-radius:6px; font-size:12px; cursor:pointer;
            transition:all 150ms ease;
          "
        >
          Cancel
        </button>
        <button
          onclick={handleConfirm}
          style="
            background:var(--danger); color:#fff;
            border:none; padding:6px 14px;
            border-radius:6px; font-size:13px; font-weight:500;
            cursor:pointer; transition:opacity 150ms ease;
          "
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
{/if}
