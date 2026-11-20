<!-- ColourPopover: one instance for the whole panel, moved between swatches by changing `anchor`. Eight presets
     and a "More" native colour input (arrow keys move between them), a hex field that commits on Enter or blur,
     and "Copy to all LEDs". Esc closes and puts focus back on the swatch (the Popover primitive does that). -->
<script lang="ts">
  import { Popover, Field, Button } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { PRESETS, parseHex, snapHex, showHex } from './colour';

  let {
    open = $bindable(false),
    anchor,
    label,
    value,
    onpick,
    oncopyall,
    boundary = null
  }: {
    open: boolean;
    anchor: HTMLElement | null;
    label: string;
    value: string;
    onpick: (hex: string) => void;
    /** Omit to hide "Copy to all LEDs" (steady, one colour for all). */
    oncopyall?: () => void;
    /** The panel: the popover stays inside it. */
    boundary?: HTMLElement | null;
  } = $props();

  let text = $state('');
  let invalid = $state('');
  let field = $state<HTMLInputElement | null>(null);
  let entered = false;
  let row = $state<HTMLElement | null>(null);

  // The field follows the colour whenever it changes from outside (another swatch, a preset, the native picker).
  $effect.pre(() => {
    text = showHex(value);
    invalid = '';
  });

  const current = $derived(PRESETS.findIndex((p) => p.hex === value));

  function pick(hex: string) {
    const h = snapHex(hex);
    if (h !== value) onpick(h);
  }

  function commit() {
    const h = parseHex(text);
    if (!h) {
      invalid = copy.light.hexInvalid;
    } else {
      invalid = '';
      pick(h);
      text = showHex(snapHex(h));
    }
    if (entered) field?.focus();
    entered = false;
  }

  function rowKeys(e: KeyboardEvent) {
    const items = Array.from(row?.querySelectorAll<HTMLElement>('[data-swatch]') ?? []);
    const i = items.indexOf(e.target as HTMLElement);
    if (i < 0) return;
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = items.length - 1;
    if (j < 0) return;
    e.preventDefault();
    items[j].focus();
  }

  /** First focus goes to the chosen preset (or the first), after the Popover has focused its card. */
  function initialFocus(node: HTMLElement) {
    const id = requestAnimationFrame(() => {
      const el = node.querySelector<HTMLElement>('[aria-pressed="true"]') ?? node.querySelector<HTMLElement>('[data-swatch]');
      el?.focus({ preventScroll: true });
    });
    return { destroy: () => cancelAnimationFrame(id) };
  }
</script>

<Popover bind:open {anchor} placement="bottom" align="start" {boundary} {label} offset={8}>
  <div class="body">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="presets" role="group" aria-label={copy.light.presets} bind:this={row} onkeydown={rowKeys} use:initialFocus>
      {#each PRESETS as p, i (p.id)}
        <button
          type="button"
          class="dot"
          class:on={i === current}
          data-swatch
          style:background={p.hex}
          aria-label={copy.light.presetNames[p.id]}
          aria-pressed={i === current}
          tabindex={i === Math.max(current, 0) ? 0 : -1}
          onclick={() => pick(p.hex)}
        ></button>
      {/each}
      <span class="dot more" class:on={current < 0}>
        <input
          type="color"
          data-swatch
          tabindex="-1"
          aria-label={copy.light.more}
          title={copy.light.more}
          {value}
          oninput={(e) => pick(e.currentTarget.value)}
        />
      </span>
    </div>
    <div class="foot">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="hex" onkeydowncapture={(e) => { if (e.key === 'Enter') entered = true; }}>
        <Field label={copy.light.hex} bind:value={text} bind:el={field} maxlength={7} {invalid} onchange={commit} />
      </div>
      {#if oncopyall}
        <Button variant="text" size="sm" onclick={oncopyall}>{copy.light.copyAll}</Button>
      {/if}
    </div>
  </div>
</Popover>

<style>
  .body { width: 290px; margin: -6px -8px; }
  .presets { display: flex; align-items: center; gap: 4px; }
  .dot {
    position: relative;
    flex: none;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(27, 35, 48, 0.16);
    transition: transform var(--t-fast) var(--ease-out);
  }
  .dot:hover { transform: scale(1.08); }
  .dot.on { box-shadow: inset 0 0 0 1px rgba(27, 35, 48, 0.16), 0 0 0 2px var(--c-white), 0 0 0 4px var(--c-ink); }
  .dot:focus-visible { box-shadow: var(--focus-ring); }
  .more { background: conic-gradient(#f33, #fd3, #3d5, #3cf, #36f, #c3f, #f33); margin-left: 2px; }
  .more input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 50%;
    opacity: 0;
    cursor: pointer;
  }
  .more:has(input:focus-visible) { box-shadow: var(--focus-ring); }
  .foot { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-3); margin-top: 14px; }
  .hex { width: 112px; }
  .hex :global(label) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .hex :global(input) { height: 32px; padding: 0 10px; font-size: var(--fs-md); font-variant-numeric: tabular-nums; }
  .foot :global(.btn) { margin-top: 2px; }
</style>
