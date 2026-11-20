<script lang="ts">
  import type { Snippet } from 'svelte';
  import Controller from '$lib/controller/Controller.svelte';
  import { attachLive } from '$lib/controller/live';
  import { keyOf, isPartId, PARTS, PART_IDS, type PartId } from '$lib/controller/parts';
  import { Chip } from '$lib/ui';
  import { copy, fmt } from '$lib/copy';
  import type { InputBus } from '$lib/device/input';
  import { describeBinding } from '$lib/stores/changes';
  import { profile } from '$lib/stores/profile.svelte';
  import { lighting } from '$lib/stores/lighting.svelte';
  import { scripts } from '$lib/stores/scripts.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { panelFor } from './panels';
  import { unsavedCount } from './actions.svelte';

  /** `children` is the save bar: it takes the hint's place under the chips. */
  let { bus, children }: { bus: InputBus; children?: Snippet } = $props();

  const PADDLES = ['m1', 'm2', 'm3', 'm4'] as const;
  let fade = $state(0);

  // Fields the light panel sets while it is open (hovered LED, a step to hold still). Read defensively so the
  // stage works whether or not the lighting store has them yet.

  let svg = $state<SVGSVGElement>();
  let step = $state(0);

  const open = $derived(!!panelFor(session.selection));
  const lightOpen = $derived(session.selection === 'light');
  const selected = $derived(isPartId(session.selection) ? session.selection : null);
  const preview = $derived(lightOpen ? lighting.previewStep : null);
  const ledHover = $derived(lightOpen ? (lighting.hoverLed ?? lighting.pickLed) : null);

  const captions = $derived.by(() => {
    const d = profile.draft;
    if (!d) return {};
    return Object.fromEntries(PADDLES.map((p) => [p, describeBinding(d, keyOf(p)!, scripts.list)]));
  });
  /** Accessible names with the mapping: "M3, B, turbo", "M4, not set". Unchanged buttons keep their own name. */
  const names = $derived.by(() => {
    const d = profile.draft;
    const out: Partial<Record<PartId, string>> = {};
    if (!d) return out;
    for (const p of PART_IDS) {
      const k = PARTS[p].inspector === 'button' ? keyOf(p) : null;
      if (k === null) continue;
      const b = describeBinding(d, k, scripts.list);
      if (b.muted && !(PADDLES as readonly string[]).includes(p)) continue;
      const mapping = [b.muted ? b.line1.toLowerCase() : b.line1, b.line2.toLowerCase()].filter(Boolean).join(', ');
      out[p] = fmt(copy.main.partName, { name: PARTS[p].name, mapping });
    }
    return out;
  });
  const leds = $derived(lighting.ledsAt(preview ?? step));
  /** Brightness as drawn: off at 0, otherwise never so faint that a lit bar looks off. */
  const ledLevel = $derived.by(() => {
    const b = lighting.draft?.brightness ?? 100;
    return b <= 0 ? 0 : 0.25 + 0.75 * Math.min(1, b / 100);
  });

  // Live input painted straight onto the drawing.
  $effect(() => {
    if (!svg) return;
    const h = attachLive(svg, bus);
    return () => h.detach();
  });

  // Animated lighting: follow the lighting store's clock (the controller's position in its loop, as far as the app
  // knows), fading towards the next step so the colour lands on it as the step ends. Held on a step while the
  // panel previews one; still with reduced motion.
  $effect(() => {
    const d = lighting.draft;
    void lighting.animRev;
    if (!d || d.mode !== 'animated' || preview !== null || matchMedia('(prefers-reduced-motion: reduce)').matches) { step = 0; fade = 0; return; }
    const steps = Math.max(1, ...d.grid.map((s) => s.length));
    let timer: ReturnType<typeof setTimeout> | undefined, raf = 0;
    const next = (first: boolean) => {
      const pos = lighting.animPos(), k = Math.floor(pos), left = Math.max(1, (k + 1 - pos) * lighting.animStepMs);
      const head = () => { fade = left; step = (k + 1) % steps; };
      if (first) { fade = 0; step = k % steps; raf = requestAnimationFrame(head); } else head();
      timer = setTimeout(() => next(false), left + 4);
    };
    next(true);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  });

  // Narrow windows: the inspector overlays the right of the window, so the stage shrinks into the room left of it.
  // When that room is too small to be useful (very narrow, or zoomed in), the drawing is covered: not focusable.
  let vw = $state(1440);
  const OVERLAY = 1180; // below this the inspector overlays the stage (see the CSS)
  const PANEL_ROOM = 440; // inspector width 376 + its 40 px margin + 24 px air
  const covered = $derived(open && vw < OVERLAY && vw - PANEL_ROOM < 260);
  const docked = $derived(open && vw < OVERLAY);

  const choose = (p: PartId) => session.select(p);
  const toggle = (s: 'gyro' | 'vibration') => (e: MouseEvent) => {
    e.preventDefault();
    session.select(session.selection === s ? null : s);
  };
</script>

<svelte:window bind:innerWidth={vw} />

<div class="stage" class:open class:docked data-stage tabindex="-1">
  <div class="ctl" inert={covered}>
    <Controller {selected} onselect={choose} {captions} {names} {leds} {ledLevel} ledFade={fade} {ledHover} bind:svg />
  </div>
  <div class="chips" inert={covered}>
    <Chip class="stage-chip" dataChip="gyro" selected={session.selection === 'gyro'} onclick={toggle('gyro')}>{copy.main.chips.gyro}</Chip>
    <Chip class="stage-chip" dataChip="vibration" selected={session.selection === 'vibration'} onclick={toggle('vibration')}>{copy.main.chips.vibration}</Chip>
  </div>
  <div class="foot">
    <p class="hint" class:gone={!!session.selection || unsavedCount() > 0}>{copy.main.hint}</p>
    {@render children?.()}
  </div>
</div>

<style>
  .stage {
    --top: 98px;
    --chrome: 370px; /* everything above and below the drawing: top bar, padding, chips, save bar */
    position: absolute;
    inset: 84px 0 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--top) 24px 0;
    transition: transform 260ms var(--ease-out);
  }
  /* The drawing scales with the window: up to 960 wide, never taller than the room left. */
  .ctl { width: min(960px, 100%, calc((100vh - var(--chrome)) * 720 / 490)); flex: none; }
  /* Wide windows keep room for the inspector beside the drawing whether or not one is open, so opening a panel
     moves the drawing but never resizes it (420 = inspector 376 + air; the stage shifts left by 190 when open). */
  @media (min-width: 1180px) {
    .ctl { width: min(960px, calc(100vw - 2 * var(--edge) - 420px), calc((100vh - var(--chrome)) * 720 / 490)); }
  }
  .chips { display: flex; gap: var(--s-3); margin-top: var(--s-6); }
  /* White pills on the cloudy page, 15 px medium, as in the mock-up; ink when their panel is open. */
  .chips :global(.stage-chip) { height: 36px; padding: 0 var(--s-4); font-weight: var(--fw-medium); }
  .chips :global(.stage-chip:not(.on)) { background: rgba(255, 255, 255, 0.92); }
  .chips :global(.stage-chip:not(.on):hover) { background: var(--c-well); }
  .chips :global(.stage-chip:focus-visible) { box-shadow: var(--focus-ring); }
  .foot { display: grid; justify-items: center; margin-top: 26px; }
  .foot > :global(*) { grid-area: 1 / 1; }
  .foot > :global(.bar) { margin-top: 14px; } /* the save bar sits a little lower than the hint, as in the mock-up */
  /* The hint comes back only after the leaving save bar has faded (same grid cell): they never overlap. */
  .hint { color: var(--c-mute); font-size: var(--fs-lg); transition: opacity var(--t-med) var(--t-slow), visibility 0s; }
  .hint.gone { opacity: 0; visibility: hidden; transition: opacity 0s, visibility 0s; }
  .stage:focus-visible { box-shadow: none; }

  /* Wide windows: room for the inspector on the right, so the stage moves left by half its width and margin.
     Narrower ones: the inspector overlays the stage instead. */
  @media (min-width: 1180px) { .stage.open { transform: translateX(-190px); } }
  /* Narrower: the stage keeps to the room left of the inspector, so the selected part stays in view, and the save
     bar docks under the inspector (which ends above it) so Discard and Save are never covered. */
  .stage.docked { right: min(440px, 100vw); padding-left: 16px; padding-right: 16px; transition: none; }
  .stage.docked .foot > :global(.bar) {
    position: fixed; right: var(--edge); bottom: 24px; width: max-content; min-width: 376px; max-width: calc(100vw - 32px); margin: 0; z-index: 11;
    padding-left: var(--s-4);
  }
  /* Short windows: less air above the drawing. */
  @media (max-height: 760px) { .stage { --top: 24px; --chrome: 250px; } .chips { margin-top: var(--s-4); } .foot { margin-top: 14px; } .foot > :global(.bar) { margin-top: 0; } }
  @media (prefers-reduced-motion: reduce) { .stage { transition: none; } }
</style>
