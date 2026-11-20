<!-- KeyGrid: the 16 target buttons as chips in a 4-column grid. Multi-select; the parent decides what a click
     means (it calls preventDefault so the chip does not toggle itself). D-pad arrows are icons with names. -->
<script lang="ts">
  import { Chip } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { KEY_NAMES } from '$lib/protocol/config';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { TARGETS, ARROWS } from './logic';

  let { selected, label, ontoggle }: { selected: number[]; label: string; ontoggle: (button: number) => void } =
    $props();

  const ICONS = { up: ArrowUp, down: ArrowDown, left: ArrowLeft, right: ArrowRight };
</script>

<div class="grid" role="group" aria-label={label}>
  {#each TARGETS as t (t)}
    {@const arrow = ARROWS[t]}
    <Chip
      selected={selected.includes(t)}
      ariaLabel={arrow ? copy.button.arrows[arrow] : undefined}
      onclick={(e) => {
        e.preventDefault();
        ontoggle(t);
      }}
    >
      {#if arrow}
        {@const Icon = ICONS[arrow]}
        <Icon size={16} strokeWidth={2.25} aria-hidden="true" />
      {:else}
        {KEY_NAMES[t]}
      {/if}
    </Chip>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
</style>
