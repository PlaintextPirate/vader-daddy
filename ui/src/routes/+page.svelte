<script lang="ts">
  import '$lib/theme/tokens.css';
  import '$lib/theme/base.css';
  import { onMount, setContext, untrack, type Component } from 'svelte';
  import { Toasts, Button } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { flags } from '$lib/flags';
  import { device } from '$lib/device/device.svelte';
  import { createInputBus, type InputBus } from '$lib/device/input';
  import { demoControls } from '$lib/device/transport';
  import { session } from '$lib/stores/session.svelte';
  import { profile } from '$lib/stores/profile.svelte';
  import { lighting } from '$lib/stores/lighting.svelte';
  import { scripts } from '$lib/stores/scripts.svelte';
  import { history } from '$lib/stores/history.svelte';
  import { unsaved } from '$lib/stores/unsaved.svelte';
  import { toasts } from '$lib/stores/toasts.svelte';
  import { exposeDebug } from '$lib/stores/debug';
  import { loadSlot } from '$lib/app/actions.svelte';
  import { installShortcuts } from '$lib/app/shortcuts';
  import { hardware } from '$lib/app/hardware.svelte';
  import Boundary from '$lib/app/Boundary.svelte';
  import TopBar from '$lib/app/TopBar.svelte';
  import Stage from '$lib/app/Stage.svelte';
  import Inspector from '$lib/app/Inspector.svelte';
  import SaveBar from '$lib/app/SaveBar.svelte';
  import EmptyState from '$lib/app/EmptyState.svelte';
  import Lazy from '$lib/app/Lazy.svelte';

  // Views, the palette and the script sheet load on first use (own chunks), like the panels.
  const HistoryView = () => import('$lib/app/HistoryView.svelte');
  const SettingsView = () => import('$lib/app/SettingsView.svelte');
  const CommandPalette = () => import('$lib/app/CommandPalette.svelte');
  const ScriptSheet = () => import('$lib/sheets/ScriptSheet.svelte');

  // The shell: composes the pieces and wires the stores together. No logic of its own.
  const bus = createInputBus();
  // Panels read the live input bus from context (falling back to an inert bus when absent).
  setContext('vader.inputBus', bus);
  const modal = $derived(!!session.sheet || session.palette);
  const ready = $derived(device.status === 'connected' && !!profile.draft);
  const showDebug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
  let Badge = $state<Component<{ bus: InputBus }> | null>(null);

  // Controller-wide options are re-read after the controller comes back.
  $effect(() => { if (device.status !== 'connected') hardware.reset(); });

  /** Error toasts about the connection or about reading a profile: stale once the connection changes. */
  const CONNECTION_ERRORS: string[] = [copy.errors.service, copy.errors.timeout, copy.errors.lost, copy.errors.controller];
  const stale = (t: { kind: string; text: string }) =>
    t.kind === 'error' && (CONNECTION_ERRORS.includes(t.text) || t.text.endsWith(copy.slots.readFailed));
  // Offline: the no-controller screen says it; profile read errors would contradict it. (Back online, onConnect
  // below clears the connection errors too.)
  $effect(() => {
    if (device.status !== 'disconnected') return;
    untrack(() => {
      toasts.dismissWhere((t) => t.kind === 'error' && t.text.endsWith(copy.slots.readFailed));
      profile.readErrors = {};
    });
  });

  onMount(() => {
    const stops = [session.init(), profile.init(), lighting.init(), unsaved.init()];
    const offConnect = device.onConnect(async () => {
      profile.readErrors = {};
      toasts.dismissWhere(stale);
      await loadSlot(session.slot);
      hardware.reset();  // what the Settings view can read depends on the connection
    });
    const stopDevice = device.start();
    bus.start();
    const offMode = bus.subscribe((s) => device.noteInputMode(s.connected ? s.mode : undefined));
    const uninstall = installShortcuts(bus);
    exposeDebug({ device, profile, lighting, session, scripts, history, hardware, toasts, flags, bus, demo: demoControls });
    if (showDebug) import('$lib/app/DebugBadge.svelte').then((m) => (Badge = m.default), () => {});
    return () => { stops.forEach((s) => s()); offConnect(); offMode(); stopDevice(); bus.stop(); uninstall(); };
  });
</script>

<svelte:head><title>VaderDaddy</title></svelte:head>

<!-- The Mac app draws its title bar over the top 36 px: nothing interactive there. -->
<div class="titlebar" aria-hidden="true"></div>

<!-- A modal (script sheet, palette) makes everything behind it inert, so neither Tab nor a screen reader leaves it. -->
<div class="contents" inert={modal}><TopBar /></div>

<!-- While a save or restore writes (session.writing) the editing regions are inert: the read-back replaces the
     draft, so an edit made meanwhile would be lost. The save bar's progress line shows the write. -->
<main inert={session.writing || modal} aria-busy={session.writing}>
  {#if session.view === 'history'}
    <Boundary name="history"><Lazy load={HistoryView} props={{}} /></Boundary>
  {:else if session.view === 'settings'}
    <Boundary name="settings"><Lazy load={SettingsView} props={{}} /></Boundary>
  {:else if ready}
    <Boundary name="stage">
      <Stage {bus}><SaveBar /></Stage>
    </Boundary>
    <Boundary name="inspector"><Inspector /></Boundary>
  {:else if device.status === 'disconnected'}
    <EmptyState />
  {:else if profile.readErrors[session.slot]}
    <div class="failed" role="alert">
      <p>{profile.readErrors[session.slot]}</p>
      <Button variant="dark" onclick={() => loadSlot(session.slot)} disabled={!!device.busy}>{copy.slots.retry}</Button>
    </div>
  {/if}
</main>

{#if session.sheet}<div class="contents" inert={session.writing}><Boundary name="script sheet"><Lazy load={ScriptSheet} props={{ id: session.sheet.id }} /></Boundary></div>{/if}
{#if session.palette}<Boundary name="palette"><Lazy load={CommandPalette} props={{}} /></Boundary>{/if}
<Toasts items={toasts.items} ondismiss={toasts.dismiss} />
{#if Badge}<Badge {bus} />{/if}

<style>
  .titlebar { position: fixed; top: 0; left: 0; right: 0; height: 36px; }
  main { position: fixed; inset: 0; overflow: hidden; }
  .contents { display: contents; }
  .failed { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: var(--s-4); color: var(--c-mute); }
</style>
