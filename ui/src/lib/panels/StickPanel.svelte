<script lang="ts">
  // Stick panel: Range (dead zone, outer limit, circularity) and, behind flags.responseCurve, Response (the curve).
  // Edits go straight into profile.draft; with "Same for the other stick" on, each edit is applied to both sides.
  import { Panel, Seg } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { flags } from '$lib/flags';
  import { profile } from '$lib/stores/profile.svelte';
  import { session } from '$lib/stores/session.svelte';
  import type { PartId } from '$lib/controller/parts';
  import type { ProfileDraft } from '$lib/stores/changes';
  import { other, sticksEqual, copyStick } from './analog/edits';
  import { mirror } from './analog/mirror.svelte';
  import RangeTab from './analog/RangeTab.svelte';
  import ResponseTab from './analog/ResponseTab.svelte';

  let { side = 'left' }: { part?: PartId; side?: 'left' | 'right' } = $props();

  const curve = flags.responseCurve;
  const tabs = [
    { id: 'range', label: copy.stick.tabs.range },
    ...(curve ? [{ id: 'response', label: copy.stick.tabs.response }] : [])
  ];
  let tab = $state('range');
  const title = $derived(side === 'right' ? copy.stick.right : copy.stick.left);
  const draft = $derived(profile.draft);
  const identical = $derived(draft ? sticksEqual(draft, curve) : false);

  /** Applies an edit to this stick, and to the other one while mirroring is on. */
  function edit(fn: (d: ProfileDraft, s: 'left' | 'right') => void) {
    const d = profile.draft;
    if (!d) return;
    const both = mirror.on('stick', sticksEqual(d, curve));
    fn(d, side);
    if (both) fn(d, other(side));
  }
  const copyOver = () => { if (profile.draft) copyStick(profile.draft, side, other(side), curve); };
</script>

{#snippet seg()}<Seg options={tabs} bind:value={tab} label={title} />{/snippet}

<Panel {title} onclose={() => session.select(null)} tabs={tabs.length > 1 ? seg : undefined}>
  {#if draft}
    {#if tab === 'response' && curve}
      <ResponseTab {draft} {side} {edit} {identical} oncopy={copyOver} />
    {:else}
      <RangeTab {draft} {side} {curve} {edit} {identical} oncopy={copyOver} />
    {/if}
  {/if}
</Panel>
