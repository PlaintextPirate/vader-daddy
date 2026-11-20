<!-- "Same for the right stick" (or left / triggers). Switching it on makes the other side equal straight away
     (`oncopy`); while on, the panel mirrors every edit. Session UI state, see mirror.svelte.ts. -->
<script lang="ts">
  import { Switch } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { mirror } from './mirror.svelte';

  let { kind, side, identical, oncopy }: {
    kind: 'stick' | 'trigger';
    side: 'left' | 'right';
    identical: boolean;
    oncopy: () => void;
  } = $props();

  const label = $derived(side === 'left' ? copy[kind].sameRight : copy[kind].sameLeft);
  const on = $derived(mirror.on(kind, identical));

  function change(v: boolean) {
    mirror.set(kind, v);
    if (v && !identical) oncopy();
  }
</script>

<Switch {label} checked={on} onchange={change} />
