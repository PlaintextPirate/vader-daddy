<!-- ButtonPanel: what one button does. Chips choose the buttons it presses (one = remap, several = together),
     Hold / Toggle / Turbo how, or a script from the library instead. Every edit goes through setBinding on the
     draft; an edit the controller cannot hold is refused with a toast and leaves the draft as it was. -->
<script lang="ts">
  import { Panel, Button, Divider, Seg } from '$lib/ui';
  import { copy, fmt, macrosUsed } from '$lib/copy';
  import { PARTS, keyOf, type PartId } from '$lib/controller/parts';
  import { KEY_NAMES, MAX_MACROS } from '$lib/protocol/config';
  import { bindingOf, type Binding, type Script } from '$lib/protocol/bindings';
  import { profile } from '$lib/stores/profile.svelte';
  import { scripts } from '$lib/stores/scripts.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { toasts } from '$lib/stores/toasts.svelte';
  import KeyGrid from './button/KeyGrid.svelte';
  import ModeControls from './button/ModeControls.svelte';
  import ScriptList from './button/ScriptList.svelte';
  import { shownButtons, toggleTarget, tryBinding, NOT_SET } from './button/logic';

  let { part }: { part?: PartId; side?: 'left' | 'right' } = $props();

  const REAR: PartId[] = ['m1', 'm2', 'm3', 'm4', 'c', 'z'];
  const DIRS = [
    { id: '0', label: copy.button.dirs.up },
    { id: '1', label: copy.button.dirs.right },
    { id: '2', label: copy.button.dirs.down },
    { id: '3', label: copy.button.dirs.left }
  ];
  let dir = $state('0');

  const keyId = $derived(part === 'dpad' ? Number(dir) : part ? keyOf(part) : null);
  const title = $derived(
    !part ? '' : PARTS[part].inspector === 'stick' && keyId !== null ? KEY_NAMES[keyId] : PARTS[part].name
  );
  const draft = $derived(profile.draft);
  const binding = $derived<Binding | null>(draft && keyId !== null ? bindingOf(draft, keyId) : null);
  // By link, not by content: two identical library scripts, or another button with the same content, never mix.
  const current = $derived(binding?.kind === 'script' && keyId !== null ? scripts.linkedTo(keyId) : undefined);
  const used = $derived(draft?.macros.length ?? 0);

  function apply(b: Binding): boolean {
    if (!draft || keyId === null) return false;
    const r = tryBinding(draft, keyId, b);
    if (r === 'tooMany') toasts.error(copy.script.tooMany);
    else if (r === 'tooLong') toasts.error(copy.script.tooLong);
    if (r === 'ok') scripts.link(keyId, b.kind === 'script' ? b.script?.id || null : null);
    return r === 'ok';
  }
  const scriptBinding = (s: Script): Binding => ({ ...NOT_SET, kind: 'script', script: s });

  function newScript() {
    const s = scripts.create();
    if (apply(scriptBinding(s))) session.openSheet(s.id);
    else scripts.discard(s.id); // no button was changed: only the library entry goes
  }
  function keep() {
    if (!binding?.script || keyId === null) return;
    const { mode, cycleMs, actions } = binding.script;
    const s = scripts.create({ name: fmt(copy.button.fromButton, { button: KEY_NAMES[keyId] }), mode, cycleMs, actions });
    scripts.link(keyId, s.id);
  }
</script>

<Panel {title} onclose={() => session.select(null)}>
  {#if part === 'dpad'}
    <div class="dirs"><Seg options={DIRS} bind:value={dir} label={copy.button.direction} /></div>
  {/if}
  {#if binding && keyId !== null}
    <div class="head">
      <span class="label">{copy.button.presses}</span>
      <span class="hint">{copy.button.hint}</span>
    </div>
    <KeyGrid
      selected={shownButtons(binding, keyId)}
      label={copy.button.presses}
      ontoggle={(t) => apply(toggleTarget(binding, keyId, t))}
    />
    {#if binding.kind === 'script'}
      <!-- A script decides its own timing: no Hold / Toggle / Turbo to grey out, one line saying so. -->
      <p class="scripted">
        {copy.button.scriptDecides}
        {#if current}<Button variant="text" size="sm" onclick={() => current && session.openSheet(current.id)}>{copy.button.openScriptShort}</Button>{/if}
      </p>
    {:else}
      <div class="mode"><ModeControls {binding} {keyId} {apply} /></div>
    {/if}

    <Divider space={16} />
    <p class="label sub">{copy.button.orScript}</p>
    <ScriptList
      list={scripts.list}
      currentId={current?.id ?? null}
      unknown={binding.kind === 'script' && !current}
      onassign={(s) => apply(scriptBinding(s))}
      onopen={session.openSheet}
      onkeep={keep}
      onnew={newScript}
    />

    <div class="foot">
      <Button variant="text" disabled={binding.kind === 'default'} onclick={() => apply({ ...NOT_SET })}>
        {copy.button.clear}
      </Button>
      {#if part && REAR.includes(part)}<p class="note">{copy.button.rearNote}</p>{/if}
      {#if used >= MAX_MACROS - 1}<p class="note">{macrosUsed(used, MAX_MACROS)}</p>{/if}
    </div>
  {/if}
</Panel>

<style>
  .dirs { margin: -6px 0 var(--s-5); --seg-width: 100%; }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
    margin-bottom: var(--s-3);
  }
  .label { font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--c-ink); }
  .hint { font-size: var(--fs-sm); color: var(--c-mute); text-align: right; }
  .mode { margin-top: var(--s-6); }
  .scripted {
    display: flex; align-items: center; justify-content: space-between; gap: var(--s-3);
    margin-top: var(--s-5); font-size: var(--fs-sm); color: var(--c-mute);
  }
  .scripted :global(.btn) { margin-right: 0; }
  .sub { margin-bottom: var(--s-1); color: var(--c-mute); }
  .foot { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s-2); margin-top: var(--s-6); }
  .note { font-size: var(--fs-sm); color: var(--c-mute); }
</style>
