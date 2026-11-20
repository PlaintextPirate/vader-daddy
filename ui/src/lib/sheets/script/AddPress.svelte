<!-- AddPress: a button that opens a small popover with the 16 buttons as chips; picking one calls `onpick` and
     closes it, and focus goes back to the button. -->
<script lang="ts">
  import { Button, Popover } from '$lib/ui';
  import { copy } from '$lib/copy';
  import type { ButtonVariant } from '$lib/ui';
  import KeyGrid from '$lib/panels/button/KeyGrid.svelte';

  let {
    label,
    variant = 'soft',
    onpick,
    el = $bindable(null)
  }: { label: string; variant?: ButtonVariant; onpick: (button: number) => void; el?: HTMLButtonElement | null } =
    $props();

  let open = $state(false);

  function pick(button: number) {
    open = false;
    onpick(button);
    el?.focus({ preventScroll: true });
  }
</script>

<Button
  bind:el
  {variant}
  aria-haspopup="dialog"
  aria-expanded={open}
  onclick={() => (open = !open)}
>
  {label}
</Button>
<!-- Lined up with the button's start edge and kept inside the sheet (never over its footer from outside). -->
<Popover bind:open anchor={el} placement="bottom" align="start" boundary={el?.closest<HTMLElement>('[role=dialog]') ?? null}
  label={copy.script.pickButton}>
  <div class="pick"><KeyGrid selected={[]} label={copy.script.pickButton} ontoggle={pick} /></div>
</Popover>

<style>
  .pick { width: 304px; }
</style>
