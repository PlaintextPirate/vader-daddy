<script lang="ts" module>
  // Section and navigation icons, from Lucide (https://lucide.dev, ISC licence).
  import Lightbulb from '@lucide/svelte/icons/lightbulb';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import Archive from '@lucide/svelte/icons/archive';
  import Terminal from '@lucide/svelte/icons/terminal';
  import Cpu from '@lucide/svelte/icons/cpu';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import ListVideo from '@lucide/svelte/icons/list-video';
  import Joystick from '@lucide/svelte/icons/joystick';
  import Gauge from '@lucide/svelte/icons/gauge';
  import Rotate3d from '@lucide/svelte/icons/rotate-3d';
  import Vibrate from '@lucide/svelte/icons/vibrate';
  import Power from '@lucide/svelte/icons/power';
  import Activity from '@lucide/svelte/icons/activity';

  export const ICONS = {
    lighting: Lightbulb, profile: Gamepad2, controller: SlidersHorizontal, backups: Archive, log: Terminal,
    chip: Cpu, buttons: CircleDot, scripts: ListVideo, sticks: Joystick, triggers: Gauge, gyro: Rotate3d,
    vibration: Vibrate, power: Power, input: Activity
  } as const;
  export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
  let { name, size = 16 }: { name: IconName; size?: number } = $props();
  const Glyph = $derived(ICONS[name]);
</script>

<Glyph {size} strokeWidth={1.8} aria-hidden="true" class="icon" />

<style>
  :global(svg.icon) { flex: none; }
</style>
