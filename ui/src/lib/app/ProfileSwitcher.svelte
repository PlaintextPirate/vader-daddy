<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { Popover, Button } from '$lib/ui';
  import { copy, fmt, slotLabel } from '$lib/copy';
  import { flags } from '$lib/flags';
  import { device } from '$lib/device/device.svelte';
  import { profile } from '$lib/stores/profile.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { pending, requestSwitch, resolveSwitch } from './actions.svelte';
  import ProfileMenu from './ProfileMenu.svelte';

  const SLOTS = [0, 1, 2, 3];
  const pills: (HTMLButtonElement | null)[] = $state([null, null, null, null]);
  const name = $derived(flags.profileNames ? profile.draft?.name ?? '' : '');
</script>

<nav class="switcher" aria-label={copy.top.slots}>
  <span class="label">{copy.profile.title}</span>
  {#each SLOTS as s (s)}
    {#if s === session.slot}
      <button bind:this={pills[s]} class="pill current" aria-haspopup="dialog" aria-expanded={session.menu === 'profile'}
        aria-label="{slotLabel(s)}{name ? `, ${name}` : ''}. {copy.top.menu}"
        onclick={() => (session.menu = session.menu === 'profile' ? null : 'profile')}>
        <span class="num">{s + 1}</span>{#if name}<span class="name">{name}</span>{/if}
        <ChevronDown size={16} strokeWidth={2.4} />
      </button>
    {:else}
      {@const err = profile.readErrors[s]}
      <button bind:this={pills[s]} class="pill num"
        aria-label={err ? fmt(copy.slots.unreadable, { n: s + 1, reason: err }) : slotLabel(s)} title={err || undefined}
        disabled={!!device.busy} onclick={() => requestSwitch(s)}>
        {s + 1}
        {#if err}<i class="warn" aria-hidden="true"></i>{/if}
      </button>
    {/if}
  {/each}
</nav>

<ProfileMenu anchor={pills[session.slot]} />

<Popover bind:open={() => pending.slot !== null, (v) => { if (!v) resolveSwitch('cancel'); }}
  anchor={pending.slot !== null ? pills[pending.slot] : null} label={fmt(copy.slots.switchTitle, { n: session.slot + 1 })}>
  <div class="confirm">
    <p>{fmt(copy.slots.switchTitle, { n: session.slot + 1 })}</p>
    <div class="actions">
      <Button variant="text" size="sm" onclick={() => resolveSwitch('cancel')}>{copy.confirm.cancel}</Button>
      <Button variant="soft" size="sm" onclick={() => resolveSwitch('discard')}>{copy.confirm.discard}</Button>
      <Button variant="primary" size="sm" onclick={() => resolveSwitch('save')} disabled={!!profile.error}>{copy.confirm.save}</Button>
    </div>
  </div>
</Popover>

<style>
  .switcher { display: flex; align-items: center; gap: var(--s-1); }
  .label { color: var(--c-mute); margin-right: var(--s-3); }
  .pill {
    position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    min-width: 36px; height: 36px; padding: 0 var(--s-2); border: 0; border-radius: var(--r-pill);
    background: none; font-weight: var(--fw-medium); font-size: var(--fs-md);
    transition: background var(--t-fast);
  }
  .pill:hover:not(:disabled) { background: rgba(255, 255, 255, 0.6); }
  .pill:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .pill.current { background: var(--c-ink); color: var(--c-white); padding: 0 var(--s-3) 0 var(--s-4); font-weight: var(--fw-bold); }
  .pill.current:hover { background: var(--c-ink-hover); }
  .name { max-width: 10em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .warn { position: absolute; top: 5px; right: 5px; width: 7px; height: 7px; border-radius: 50%; background: var(--c-error); }
  .confirm { width: 300px; padding: var(--s-4) var(--s-5); display: grid; gap: var(--s-3); }
  .actions { display: flex; justify-content: flex-end; gap: var(--s-2); }
</style>
