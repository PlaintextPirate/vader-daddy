<!-- PressEditor: the row under the lanes. Add a press (after the last, or at the same time), exact Start and
     Length for the selected press, and Zoom − / + / Fit on the right. -->
<script lang="ts">
  import { Button } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { KEY_NAMES } from '$lib/protocol/config';
  import AddPress from './AddPress.svelte';
  import NumBox from './NumBox.svelte';
  import { ZOOM_MAX, ZOOM_MIN, type Press } from './timeline';

  let {
    press,
    canAdd,
    zoom,
    onadd,
    onexact,
    onzoom,
    onfit,
    startEl = $bindable(null)
  }: {
    press: Press | null;
    canAdd: boolean;
    zoom: number;
    onadd: (button: number, together: boolean) => void;
    onexact: (startMs: number, holdMs: number) => void;
    onzoom: (dir: 1 | -1) => void;
    onfit: () => void;
    startEl?: HTMLInputElement | null;
  } = $props();
</script>

<div class="row">
  <div class="add" class:hidden={!canAdd}>
    <AddPress label={copy.script.addPress} onpick={(b) => onadd(b, false)} />
    <AddPress label={copy.script.atSameTime} variant="text" onpick={(b) => onadd(b, true)} />
  </div>
  <div class="sel" class:off={!press}>
    <span class="cap">{copy.script.selected}</span>
    <b class="name">{press ? KEY_NAMES[press.button] : copy.script.none}</b>
  </div>
  <NumBox
    label={copy.script.start}
    value={press?.startMs ?? null}
    disabled={!press}
    bind:el={startEl}
    onchange={(v) => press && onexact(v, press.holdMs)}
  />
  <NumBox
    label={copy.script.length}
    value={press?.holdMs ?? null}
    disabled={!press}
    onchange={(v) => press && onexact(press.startMs, v)}
  />
  <div class="zoom">
    <span class="cap lg">{copy.script.zoom}</span>
    <button type="button" class="round" aria-label={copy.script.zoomOut} disabled={zoom <= ZOOM_MIN} onclick={() => onzoom(-1)}>–</button>
    <button type="button" class="round" aria-label={copy.script.zoomIn} disabled={zoom >= ZOOM_MAX} onclick={() => onzoom(1)}>+</button>
    <Button variant="soft" size="sm" title={copy.script.fitLabel} onclick={onfit}>{copy.script.fit}</Button>
  </div>
</div>

<style>
  .row { display: flex; align-items: center; gap: var(--s-4); min-height: 48px; }
  .add { display: flex; align-items: center; gap: var(--s-3); }
  .hidden { visibility: hidden; }
  /* Fixed width (the longest button name, "Select"), so Start and Length never shift. */
  .sel { display: inline-flex; align-items: baseline; gap: 6px; width: 104px; flex: none; }
  .sel .name { overflow: hidden; text-overflow: ellipsis; }
  .sel.off .cap, .sel.off .name { color: var(--c-disabled); }
  .cap { font-size: var(--fs-sm); color: var(--c-mute); }
  .cap.lg { font-size: var(--fs-md); margin-right: 4px; }
  .name { font-size: var(--fs-lg); font-weight: var(--fw-semibold); white-space: nowrap; }
  .zoom { display: flex; align-items: center; gap: 6px; margin-left: auto; }
  .round {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--c-well);
    color: var(--c-ink);
    font-size: var(--fs-md);
    font-weight: var(--fw-bold);
    line-height: 1;
    transition: transform var(--t-fast) var(--ease-out);
  }
  .round:hover:not(:disabled) { background: var(--c-well-hover); }
  .round:active:not(:disabled) { transform: scale(0.92); }
  .round:disabled { color: var(--c-disabled); }
</style>
