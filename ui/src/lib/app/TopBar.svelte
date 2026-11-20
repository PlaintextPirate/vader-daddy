<script lang="ts">
  import { copy, devicePill } from '$lib/copy';
  import { device } from '$lib/device/device.svelte';
  import { session, type View } from '$lib/stores/session.svelte';
  import ProfileSwitcher from './ProfileSwitcher.svelte';
  import { hardware } from './hardware.svelte';

  /** What the device pill says: the connection when there is one, otherwise what is missing. */
  const pill = $derived.by(() => {
    if (device.status === 'connected' && device.info) return devicePill(copy.top.modes[device.info.mode] ?? device.info.modeName);
    if (device.lastError?.code === 'service_down') return copy.top.serviceDown;
    if (device.lastError?.code === 'unsupported') return copy.top.otherModel;
    if (device.lastError?.code === 'no_helper') return copy.top.noHelper;
    return device.status === 'connecting' ? copy.top.connecting : copy.top.none;
  });
  const down = $derived(device.status === 'disconnected' && device.lastError?.code === 'service_down');
  const connected = $derived(device.status === 'connected' && !!device.info);
  const xinput = $derived(device.info?.mode === 'dongle-xinput');
  const dongle = $derived(device.info?.connection === 'dongle');
  const switchLabel = $derived(xinput ? copy.settings.modeToD : copy.settings.modeToX);
  const go = (v: View) => session.openView(session.view === v ? 'main' : v);
</script>

<!-- y = 32..68: below the 36 px strip the Mac window draws its title bar over. -->
<header class="top">
  <div class="left">
    <span class="device" class:has-switch={connected && dongle}>
      <span class="name" role="status">
        {#if device.busy}<i class="dot busy" aria-hidden="true"></i>{:else if down}<i class="dot down" aria-hidden="true"></i>{/if}{pill}
      </span>
      {#if connected && dongle}
        <button type="button" class="round swap" disabled={!!device.busy} title={switchLabel} aria-label={switchLabel} onclick={hardware.switchMode}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2.5 5.5h10M9.5 2.5l3 3-3 3M13.5 10.5h-10M6.5 7.5l-3 3 3 3" />
          </svg>
        </button>
      {/if}
    </span>
    {#if connected}
      <button type="button" class="round off" disabled={!!device.busy} title={copy.settings.offLabel} aria-label={copy.settings.offLabel} onclick={hardware.turnOff}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
          <path d="M8 1.8v5.6M4.6 3.9a5.4 5.4 0 1 0 6.8 0" />
        </svg>
      </button>
    {/if}
  </div>
  <div class="centre">
    {#if device.status === 'connected' && session.view === 'main'}<ProfileSwitcher />{/if}
  </div>
  <nav class="right" aria-label={copy.top.settings}>
    <button type="button" class="link" aria-current={session.view === 'history' ? 'page' : undefined} onclick={() => go('history')}>{copy.top.history}</button>
    <button type="button" class="link" aria-current={session.view === 'settings' ? 'page' : undefined} onclick={() => go('settings')}>{copy.top.settings}</button>
  </nav>
</header>

<style>
  .top {
    position: absolute; top: 32px; left: var(--edge); right: var(--edge); height: 36px;
    display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: var(--s-4); z-index: 5;
  }
  .left { min-width: 0; display: flex; align-items: center; gap: var(--s-2); }
  .round {
    flex: none; display: inline-grid; place-items: center; border: 0; border-radius: 50%; color: var(--c-ink);
    transition: background var(--t-fast), color var(--t-fast);
  }
  .round:disabled { opacity: 0.5; }
  .swap { width: 28px; height: 28px; background: var(--c-well); }
  .swap:hover:not(:disabled) { background: var(--c-ink); color: var(--c-white); }
  .off { width: 36px; height: 36px; background: rgba(255, 255, 255, 0.9); }
  .off:hover:not(:disabled) { background: var(--c-error); color: var(--c-white); }
  .device.has-switch { padding-right: 4px; }
  .name { display: inline-flex; align-items: center; gap: var(--s-2); min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .device {
    display: inline-flex; align-items: center; gap: var(--s-2); min-width: 0; height: 36px; padding: 0 var(--s-4);
    border-radius: var(--r-pill); background: rgba(255, 255, 255, 0.9); font-size: var(--fs-md);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--c-mute); }
  .dot.down { background: var(--c-error); }
  .dot.busy { animation: blink 0.9s ease-in-out infinite; }
  .link {
    height: 36px; padding: 0 var(--s-4); border: 0; border-radius: var(--r-pill); background: none;
    font-size: var(--fs-md); font-weight: var(--fw-medium); color: var(--c-ink); white-space: nowrap;
    transition: background var(--t-fast);
  }
  .link:hover { background: rgba(255, 255, 255, 0.6); }
  .link[aria-current='page'] { background: var(--c-ink); color: var(--c-white); }
  @media (forced-colors: active) { .link[aria-current='page'] { outline: 2px solid Highlight; } }
  @keyframes blink { 50% { opacity: 0.3; } }
  @media (prefers-reduced-motion: reduce) { .dot.busy { animation: none; } }
  @media (max-width: 1000px) { .top { left: 16px; right: 16px; gap: var(--s-2); } }
</style>
