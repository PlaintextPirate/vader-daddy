<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { Popover, Field, Button, Divider } from '$lib/ui';
  import { copy, copiedTo, slotLabel, fmt } from '$lib/copy';
  import { device } from '$lib/device/device.svelte';
  import { flags } from '$lib/flags';
  import { NAME_MAX, clampName } from '$lib/protocol/names';
  import { profile } from '$lib/stores/profile.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { toasts } from '$lib/stores/toasts.svelte';
  import { loadSlot, slotDirty } from './actions.svelte';

  let { anchor }: { anchor: HTMLElement | null } = $props();

  let confirmReset = $state(false);
  /** A copy waiting for "Replace" because the target slot has unsaved changes. */
  let confirmCopy = $state<number | null>(null);
  const busy = $derived(!!device.busy || session.writing);
  let file = $state<HTMLInputElement | null>(null);
  const others = $derived([0, 1, 2, 3].filter((s) => s !== session.slot));
  const failed = $derived(Object.entries(profile.readErrors).map(([s, msg]) => ({ slot: +s, msg })));

  // The name lives on the draft; edit through a local value so a missing draft never breaks the binding.
  const name = {
    get value() { return profile.draft?.name ?? ''; },
    set value(v: string) { if (profile.draft) profile.draft.name = clampName(v); }
  };

  /** Asks first when the target has unsaved changes; the toast only when something was copied. */
  async function copyTo(slot: number, confirmed = false) {
    if (!confirmed && slotDirty(slot)) { confirmCopy = slot; return; }
    confirmCopy = null;
    if (await profile.copyTo(slot)) toasts.ok(copiedTo(slot + 1));
    else if (!profile.slots[slot]) toasts.error(fmt(copy.profile.copyFailed, { n: slot + 1 }));
  }
  async function pick(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = '';
    if (f) { await profile.importFile(f); session.menu = null; }
  }
  $effect(() => { if (session.menu !== 'profile') { confirmReset = false; confirmCopy = null; } });
</script>

<Popover bind:open={() => session.menu === 'profile', (v) => (session.menu = v ? 'profile' : null)} {anchor} label={copy.top.menu}>
  <div class="menu">
    {#if flags.profileNames && profile.draft?.name !== undefined}
      <Field label={copy.profile.name} bind:value={name.value} maxlength={NAME_MAX} counter />
      <Divider />
    {/if}

    <div class="row">
      <span>{copy.profile.copyTo}</span>
      <span class="pills">
        {#each others as s (s)}
          <button class="pill num" onclick={() => copyTo(s)} disabled={busy} aria-label={fmt(copy.profile.copyToN, { n: s + 1 })}>{s + 1}</button>
        {/each}
      </span>
    </div>
    {#if confirmCopy !== null}
      <p class="confirm">{fmt(copy.profile.copyConfirm, { n: confirmCopy + 1 })}</p>
      <div class="actions">
        <Button variant="text" size="sm" onclick={() => (confirmCopy = null)}>{copy.profile.cancel}</Button>
        <Button variant="dark" size="sm" disabled={busy} onclick={() => confirmCopy !== null && copyTo(confirmCopy, true)}>{copy.profile.copyAction}</Button>
      </div>
    {/if}
    <button class="item" onclick={() => { profile.exportFile(); session.menu = null; }}>{copy.profile.export}<ChevronRight size={16} /></button>
    <button class="item" onclick={() => file?.click()} disabled={busy}>{copy.profile.import}<ChevronRight size={16} /></button>
    <input bind:this={file} type="file" accept="application/json,.json" hidden onchange={pick} />
    <Divider space={0} />

    {#if confirmReset}
      <p class="confirm">{copy.profile.resetConfirm}</p>
      <div class="actions">
        <Button variant="text" size="sm" onclick={() => (confirmReset = false)}>{copy.profile.cancel}</Button>
        <Button variant="dark" size="sm" disabled={busy} onclick={() => { profile.resetToDefaults(); session.menu = null; }}>{copy.profile.resetAction}</Button>
      </div>
    {:else}
      <button class="item mute" onclick={() => (confirmReset = true)} disabled={busy}>{copy.profile.reset}</button>
    {/if}

    {#each failed as f (f.slot)}
      <div class="failed" role="status">
        <span><b>{slotLabel(f.slot)}</b> {f.msg}</span>
        <Button variant="text" size="sm" disabled={busy} onclick={() => loadSlot(f.slot)}>{copy.slots.retry}</Button>
      </div>
    {/each}
  </div>
</Popover>

<style>
  /* 320 px card as in the mock-up: the popover already pads by 20 px. */
  .menu { width: 280px; display: grid; gap: var(--s-1); }
  .row, .item { display: flex; align-items: center; justify-content: space-between; min-height: 40px; }
  .item { width: 100%; padding: 0; border: 0; background: none; text-align: left; border-radius: var(--r-8); }
  .item:hover { color: var(--c-ink-hover); }
  .item:focus-visible, .pill:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .mute { color: var(--c-mute); }
  .pills { display: flex; gap: var(--s-1); }
  .pill {
    width: 28px; height: 28px; border: 0; border-radius: var(--r-pill); background: var(--c-well);
    font-weight: var(--fw-semibold); font-size: var(--fs-sm);
  }
  .pill:hover { background: var(--c-well-hover); }
  .pill:disabled, .item:disabled { opacity: 0.5; cursor: default; }
  .confirm { color: var(--c-mute); font-size: var(--fs-sm); padding-top: var(--s-2); }
  .actions { display: flex; justify-content: flex-end; gap: var(--s-2); padding-bottom: var(--s-1); }
  .failed { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); font-size: var(--fs-sm); color: var(--c-error); }
</style>
