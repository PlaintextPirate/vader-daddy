<!-- ScriptSheet: the script timeline editor, a modal sheet. Every edit goes through scripts.update so buttons
     running the script follow. When the scripts no longer fit, the error shows inline; editing stays possible. -->
<script lang="ts">
  import { tick } from 'svelte';
  import { Sheet, Button, Divider } from '$lib/ui';
  import { copy, memoryUsed, onButton } from '$lib/copy';
  import { MAX_MACROS } from '$lib/protocol/config';
  import type { Script } from '$lib/protocol/bindings';
  import { scripts } from '$lib/stores/scripts.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { profile } from '$lib/stores/profile.svelte';
  import { toasts } from '$lib/stores/toasts.svelte';
  import TitleEdit from './script/TitleEdit.svelte';
  import ModeRow from './script/ModeRow.svelte';
  import Timeline from './script/Timeline.svelte';
  import PressEditor from './script/PressEditor.svelte';
  import AddPress from './script/AddPress.svelte';
  import { contentEnd, fitSpan, newPress, placePress, pxPerMs, zoomIn, zoomOut, type Press } from './script/timeline';

  let { id }: { id: string } = $props();

  let open = $state(true);
  const script = $derived(scripts.get(id));
  let selected = $state<number | null>(null);
  let zoom = $state(1);
  let span = $state(0);
  let width = $state(800);
  let startEl: HTMLInputElement | null = $state(null);
  let area: HTMLDivElement | null = $state(null);

  const presses = $derived(script?.actions ?? []);
  const total = $derived(Math.max(span, fitSpan(contentEnd(presses))));
  const k = $derived(pxPerMs(width, total, zoom));
  const press = $derived(selected !== null ? (presses[selected] ?? null) : null);
  const error = $derived(
    profile.error ? ((profile.draft?.macros.length ?? 0) > MAX_MACROS ? copy.script.tooMany : copy.script.tooLong) : null
  );

  $effect(() => {
    if (!script) session.sheet = null;
  });

  const edit = (fn: (s: Script) => void) => scripts.update(id, fn);
  function commit(i: number, p: Press) {
    edit((s) => {
      s.actions[i] = { ...p };
    });
  }
  async function remove(i: number) {
    edit((s) => {
      s.actions.splice(i, 1);
    });
    selected = null;
    // Keep keyboard focus in the timeline: the press that took its place, the one before, or "Add a press".
    await tick();
    const next = Math.min(i, presses.length - 1);
    const el = area?.querySelector<HTMLElement>(next >= 0 ? `[data-index="${next}"]` : '.empty button');
    el?.focus();
  }
  function add(button: number, together: boolean) {
    const p = newPress(presses, button, together);
    edit((s) => {
      s.actions.push(p);
    });
    selected = presses.length - 1;
  }
  function exact(startMs: number, holdMs: number) {
    if (selected === null) return;
    const p = placePress(presses, selected, startMs, holdMs);
    if (p) commit(selected, p);
  }
  function fit() {
    zoom = 1;
    span = fitSpan(contentEnd(presses));
  }
  function del() {
    const undo = scripts.remove(id);
    open = false;
    session.sheet = null;
    toasts.info(copy.script.deleted, { label: copy.script.undo, run: undo });
  }
</script>

{#if script}
  <Sheet bind:open title={script.name} onclose={() => (session.sheet = null)}>
    {#snippet titleContent()}
      <TitleEdit name={script.name} onrename={(n) => edit((s) => (s.name = n))} />
    {/snippet}
    {#snippet header()}
      <span class="mem">{memoryUsed(scripts.memoryPercent)}</span>
      {#each scripts.usedBy(id) as b (b)}<span class="on">{onButton(b)}</span>{/each}
    {/snippet}

    <ModeRow
      mode={script.mode}
      cycleMs={script.cycleMs}
      onmode={(m) => edit((s) => (s.mode = m))}
      onpause={(v) => edit((s) => (s.cycleMs = v))}
    />

    <div class="timeline" bind:this={area}>
      <Timeline
        {presses}
        {k}
        {total}
        {zoom}
        bind:width
        {selected}
        onselect={(i) => (selected = i)}
        oncommit={commit}
        onremove={remove}
        onenter={() => startEl?.focus()}
      >
        {#snippet empty()}
          <AddPress label={copy.script.addPress} onpick={(b) => add(b, false)} />
        {/snippet}
      </Timeline>
    </div>

    <div class="editor">
      <PressEditor
        {press}
        canAdd={presses.length > 0}
        {zoom}
        bind:startEl
        onadd={add}
        onexact={exact}
        onzoom={(d) => (zoom = d > 0 ? zoomIn(zoom) : zoomOut(zoom))}
        onfit={fit}
      />
    </div>

    <p class="err" role="status" aria-live="polite">{error ?? ''}</p>

    <Divider space={0} />
    <footer>
      <Button variant="text" onclick={del}>{copy.script.delete}</Button>
      <span class="hint">{copy.script.dragHint}</span>
    </footer>
  </Sheet>
{/if}

<style>
  .mem { font-size: var(--fs-md); color: var(--c-mute); margin-right: var(--s-1); }
  .on {
    display: inline-flex;
    align-items: center;
    height: 36px;
    padding: 0 var(--s-4);
    border-radius: var(--r-pill);
    background: var(--c-well);
    font-size: var(--fs-md);
    font-weight: var(--fw-medium);
    white-space: nowrap;
  }
  .timeline { margin-top: var(--s-12); }
  .editor { margin-top: var(--s-4); }
  .err { min-height: 20px; margin: var(--s-4) 0 var(--s-4); font-size: var(--fs-sm); color: var(--c-error); }
  footer { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); padding-top: var(--s-6); }
  .hint { font-size: var(--fs-md); color: var(--c-mute); text-align: right; }
</style>
