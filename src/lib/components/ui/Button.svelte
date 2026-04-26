<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
  type Size = 'sm' | 'md';

  let {
    children,
    href = undefined,
    variant = 'secondary',
    size = 'md',
    type = 'button',
    disabled = false,
    className = '',
    title = undefined,
    ariaLabel = undefined,
    onclick
  }: {
    children?: Snippet;
    href?: string;
    variant?: Variant;
    size?: Size;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    className?: string;
    title?: string;
    ariaLabel?: string;
    onclick?: (event: MouseEvent) => void;
  } = $props();

  const variantClasses: Record<Variant, string> = {
    primary:
      'border-transparent bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]',
    secondary:
      'border-[var(--border)] bg-[var(--panel)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]',
    ghost:
      'border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--panel-soft)] hover:text-[var(--text-primary)]',
    danger:
      'border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] text-[var(--danger)] hover:bg-[rgba(239,68,68,0.14)]',
    icon:
      'border-[var(--border)] bg-[var(--panel)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
  };

  const baseClass =
    'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:pointer-events-none disabled:opacity-45';

  const sizeClass = $derived(
    size === 'sm'
      ? variant === 'icon'
        ? 'h-8 w-8 text-xs'
        : 'px-2.5 py-1.5 text-xs'
      : variant === 'icon'
        ? 'h-9 w-9 text-sm'
        : 'px-3.5 py-2 text-sm'
  );
</script>

{#if href}
  <a
    href={href}
    onclick={onclick}
    class={`${baseClass} ${variantClasses[variant]} ${sizeClass} ${className}`}
    title={title}
    aria-label={ariaLabel}
  >
    {@render children?.()}
  </a>
{:else}
  <button
    type={type}
    disabled={disabled}
    onclick={onclick}
    class={`${baseClass} ${variantClasses[variant]} ${sizeClass} ${className}`}
    title={title}
    aria-label={ariaLabel}
  >
    {@render children?.()}
  </button>
{/if}
