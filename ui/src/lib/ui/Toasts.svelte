<!-- Toasts: a bottom-centre stack of ink pills. The region is polite; error toasts are role="alert" (assertive).
     Each toast has an optional action ("Undo") and a dismiss button; timing lives in the toast store, not here.
     Lift the stack above other bottom UI with the `--toast-bottom` custom property (default 24 px). -->
<script lang="ts" module>
  export interface ToastItem {
    id: string;
    kind: 'ok' | 'error' | 'info';
    text: string;
    action?: { label: string; run: () => void };
  }
  export interface ToastsProps {
    items: ToastItem[];
    ondismiss: (id: string) => void;
  }
</script>

<script lang="ts">
  import { copy } from '$lib/copy';

  let { items, ondismiss }: ToastsProps = $props();
</script>

<div class="stack" aria-live="polite" aria-relevant="additions">
  {#each items as t (t.id)}
    <div class="toast {t.kind}" role={t.kind === 'error' ? 'alert' : 'status'}>
      <span class="dot" aria-hidden="true"></span>
      <span class="text">{t.text}</span>
      {#if t.action}
        <button
          type="button"
          class="action"
          onclick={() => {
            t.action?.run();
            ondismiss(t.id);
          }}>{t.action.label}</button
        >
      {/if}
      <button type="button" class="x" aria-label={copy.a11y.dismiss} onclick={() => ondismiss(t.id)}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  {/each}
</div>

<style>
  .stack {
    position: fixed;
    left: 50%;
    bottom: var(--toast-bottom, 24px);
    z-index: 60;
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: var(--s-2);
    transform: translateX(-50%);
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    max-width: min(560px, calc(100vw - 32px));
    min-height: 44px;
    padding: 6px 6px 6px 16px;
    border-radius: var(--r-pill);
    background: var(--c-ink);
    color: var(--c-white);
    box-shadow: var(--sh-bar);
    font-size: var(--fs-md);
    font-weight: var(--fw-medium);
    pointer-events: auto;
    animation: fly var(--t-slow) var(--ease-out) both;
  }
  .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #8fa0b8; }
  .ok .dot { background: #43d18b; }
  .error .dot { background: #ff6b5e; }
  .text { padding: 4px 0; line-height: 1.35; }
  button {
    flex: none;
    height: 32px;
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-white);
  }
  .action { padding: 0 var(--s-3); color: var(--c-accent); font-weight: var(--fw-semibold); }
  .x { width: 32px; display: grid; place-items: center; color: rgba(255, 255, 255, 0.7); }
  button:hover { background: rgba(255, 255, 255, 0.12); }
  .x:hover { color: var(--c-white); }
  @keyframes fly {
    from { opacity: 0; transform: translateY(16px) scale(0.98); }
    to { opacity: 1; transform: none; }
  }
</style>
