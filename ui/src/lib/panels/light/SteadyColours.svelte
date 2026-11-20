<!-- SteadyColours: "One colour for all LEDs" switch, then one large swatch or five numbered ones. Hovering or
     focusing one of the five points the stage at that LED (lighting.hoverLed). -->
<script lang="ts">
  import { Switch } from '$lib/ui';
  import { copy, fmt } from '$lib/copy';
  import { lighting } from '$lib/stores/lighting.svelte';
  import type { LightDraft } from '$lib/stores/lightingModel';
  import { showHex, presetOf } from './colour';
  const colourName = (hex: string) => { const id = presetOf(hex); return id ? copy.light.presetNames[id] : showHex(hex); };

  let {
    draft,
    active,
    onpick,
    onperled
  }: {
    draft: LightDraft;
    active: number | null;
    onpick: (el: HTMLElement, led: number) => void;
    onperled: (perLed: boolean) => void;
  } = $props();

  const point = (l: number | null) => () => (lighting.hoverLed = l);
</script>

<Switch label={copy.light.oneColour} checked={!draft.perLed} onchange={(one) => onperled(!one)} />

<div class="swatches">
  {#if draft.perLed}
    <div class="five" role="group" aria-label={copy.light.steadyLeds}>
      {#each draft.steady as hex, l (l)}
        <div class="one">
          <button
            type="button"
            class="sw"
            class:active={active === l}
            style:background={hex}
            aria-label={fmt(copy.light.steadyCell, { led: l + 1, hex: colourName(hex) })}
            aria-haspopup="dialog"
            onclick={(e) => onpick(e.currentTarget, l)}
            onpointerenter={point(l)}
            onpointerleave={point(null)}
            onfocus={point(l)}
            onblur={point(null)}
          ></button>
          <span class="n" class:hot={lighting.hoverLed === l} aria-hidden="true">{l + 1}</span>
        </div>
      {/each}
    </div>
  {:else}
    <button
      type="button"
      class="sw big"
      class:active={active !== null}
      style:background={draft.steady[0]}
      aria-label={fmt(copy.light.steadyAll, { hex: colourName(draft.steady[0]) })}
      aria-haspopup="dialog"
      onclick={(e) => onpick(e.currentTarget, 0)}
    ><span class="hex num">{showHex(draft.steady[0])}</span></button>
  {/if}
</div>

<style>
  .swatches { margin-top: var(--s-3); min-height: 76px; }
  .five { display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--s-3); }
  .one { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .sw {
    padding: 0;
    border: 0;
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px rgba(27, 35, 48, 0.12);
    transition: transform var(--t-fast) var(--ease-out);
  }
  .five .sw { width: 100%; height: 48px; }
  .sw:hover { transform: scale(1.03); }
  .sw.active { box-shadow: 0 0 0 2px var(--c-white), 0 0 0 4px var(--c-ink); }
  .sw:focus-visible { box-shadow: inset 0 0 0 1px rgba(27, 35, 48, 0.12), var(--focus-ring); }
  @media (forced-colors: active) {
    .sw { forced-color-adjust: none; border: 1px solid CanvasText; }
    .sw:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
  }
  .big { display: flex; align-items: flex-end; width: 100%; height: 76px; padding: 10px 12px; border-radius: 16px; }
  .big:hover { transform: none; }
  .hex {
    padding: 2px 8px;
    border-radius: var(--r-pill);
    background: rgba(255, 255, 255, 0.85);
    color: var(--c-ink);
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
  }
  .n {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    font-size: var(--fs-sm);
    color: var(--c-mute);
    transition: background-color var(--t-fast) var(--ease-out);
  }
  .n.hot { background: var(--c-ink); color: var(--c-white); font-weight: var(--fw-semibold); }
</style>
