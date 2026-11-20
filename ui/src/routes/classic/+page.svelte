<script lang="ts">
  import '$lib/classic/app.css';
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { app } from '$lib/classic/state.svelte';
  import Lighting from '$lib/classic/Lighting.svelte';
  import Profile from '$lib/classic/Profile.svelte';
  import Controller from '$lib/classic/Controller.svelte';
  import InputPanel from '$lib/classic/InputPanel.svelte';
  import Backups from '$lib/classic/Backups.svelte';
  import Log from '$lib/classic/Log.svelte';
  import Icon, { type IconName } from '$lib/classic/Icon.svelte';

  const tabs = [
    { id: 'Lighting', sub: 'Colours and animation of the light bar', icon: 'lighting' as IconName },
    { id: 'Profile', sub: 'Buttons, scripts, sticks, triggers and vibration', icon: 'profile' as IconName },
    { id: 'Controller', sub: 'Settings that apply to the whole controller', icon: 'controller' as IconName },
    { id: 'Backups', sub: 'Saved copies of your profiles and lighting', icon: 'backups' as IconName },
    { id: 'Log', sub: 'What the app said to the controller', icon: 'log' as IconName }
  ] as const;
  type Tab = (typeof tabs)[number]['id'];
  const TAB_KEY = 'vaderdaddy.tab';
  let tab = $state<Tab>('Lighting');
  const current = $derived(tabs.find((t) => t.id === tab)!);
  let scroller = $state<HTMLElement>();

  function go(t: Tab) {
    if (t === tab) return;
    tab = t;
    if (scroller) scroller.scrollTop = 0;
    try { localStorage.setItem(TAB_KEY, t); } catch { /* storage unavailable */ }
  }

  onMount(() => {
    try { const t = localStorage.getItem(TAB_KEY); if (tabs.some((x) => x.id === t)) tab = t as Tab; } catch { /* ignore */ }
    app.tryReconnect();
    // Notice a controller that was switched on (or off) after the window opened.
    const t = setInterval(() => { if (app.status === 'disconnected' && !app.busy) app.tryReconnect(); }, 5000);
    const key = (e: KeyboardEvent) => {
      const n = +e.key;
      if (e.metaKey && n >= 1 && n <= tabs.length) { e.preventDefault(); go(tabs[n - 1].id); }
    };
    window.addEventListener('keydown', key);
    return () => { clearInterval(t); window.removeEventListener('keydown', key); };
  });

  // A success message leaves by itself; an error stays until it is dismissed or the next action starts.
  $effect(() => {
    if (!app.notice) return;
    const t = setTimeout(() => (app.notice = null), 3500);
    return () => clearTimeout(t);
  });
</script>

<svelte:head><title>VaderDaddy</title></svelte:head>

{#if app.status !== 'connected'}
  <section class="empty" in:fade={{ duration: 250 }}>
    <div class="pulse"><span></span><span></span><i></i></div>
    <h2>Looking for your controller</h2>
    <ol>
      <li>Plug the <b>2.4G dongle</b> into this Mac, or use the USB-C cable.</li>
      <li>Switch the controller on. This window connects by itself within a few seconds.</li>
      <li>For lighting that survives power-off over the dongle, use <b>XInput</b> mode.</li>
    </ol>
    <button class="primary" onclick={app.pick} disabled={!!app.busy}>{app.busy ? 'Connecting…' : 'Connect now'}</button>
    {#if app.error}<p class="err" in:fade>{app.error}</p>{/if}
  </section>
{:else}
  <div class="shell" in:fade={{ duration: 250 }}>
    <aside class="side">
      <div class="brand">Vader<b>Daddy</b></div>
      <nav style="--i:{tabs.findIndex((t) => t.id === tab)}">
        <i class="marker"></i>
        {#each tabs as t, n}
          <button class:active={tab === t.id} onclick={() => go(t.id)} title="⌘{n + 1}">
            <Icon name={t.icon} size={17} />{t.id}
          </button>
        {/each}
      </nav>
      <span class="grow"></span>
      <!-- Full page load so the classic and new stylesheets never mix. -->
      <a class="newlook" href="/{location.search}" data-sveltekit-reload>Try the new look</a>
      {#if app.info}
        <button class="device" onclick={app.refreshInfo} title="Click to re-read">
          <span class="dot" class:busy={!!app.busy}></span>
          <span>
            <b>Vader 4 Pro</b>
            <small class:warn={!app.canSaveLighting}>{app.busy ? `${app.busy}…` : app.info.modeName}</small>
            <small>Firmware {app.info.firmware}</small>
          </span>
        </button>
      {/if}
    </aside>

    <div class="content" bind:this={scroller}>
      {#if app.busy}<div class="progress" transition:fade={{ duration: 150, delay: 120 }}><i></i></div>{/if}
      {#key tab}
        <div class="view" in:fly={{ y: 10, duration: 260 }}>
          <header><h1>{current.id}</h1><p class="hint">{current.sub}</p></header>
          {#if tab === 'Lighting'}<Lighting />
          {:else if tab === 'Profile'}<Profile />
          {:else if tab === 'Controller'}<Controller />
          {:else if tab === 'Backups'}<Backups />
          {:else}<Log />{/if}
        </div>
      {/key}
    </div>

    <aside class="rail"><InputPanel /></aside>
  </div>
{/if}

<div class="toasts">
  {#if app.error && app.status === 'connected'}
    <button class="toast bad" transition:fly={{ y: 16, duration: 220 }} onclick={() => (app.error = null)}>
      <span class="selectable">{app.error}</span><em>Dismiss</em>
    </button>
  {/if}
  {#if app.notice}
    <div class="toast good" transition:fly={{ y: 16, duration: 220 }}>{app.notice}</div>
  {/if}
</div>

<style>
  /* The app window draws its title bar over the page, so every column keeps its top 36px free of controls. */
  .shell { display: grid; grid-template-columns: 196px minmax(0, 1fr) 276px; height: 100vh; }
  .side { display: flex; flex-direction: column; padding: 44px 12px 14px; background: var(--side); border-right: 1px solid var(--line); }
  .brand { font-size: 16px; letter-spacing: -0.01em; padding: 0 10px 18px; color: var(--dim); }
  .brand b { color: var(--acc); }
  .newlook { padding: 8px 10px; margin-bottom: 8px; color: var(--dim); font-size: 13px; text-decoration: none; }
  .newlook:hover { color: var(--fg); }

  nav { position: relative; display: grid; grid-auto-rows: 36px; gap: 2px; }
  .marker {
    position: absolute; left: 0; right: 0; top: 0; height: 36px; border-radius: 9px; background: var(--raised);
    box-shadow: inset 2px 0 0 var(--acc); transform: translateY(calc(var(--i) * 38px)); transition: transform var(--med) var(--ease);
  }
  nav button {
    position: relative; display: flex; align-items: center; gap: 10px; padding: 0 10px; border: none; background: none;
    color: var(--dim); text-align: left;
  }
  nav button:hover:not(:disabled) { background: none; color: var(--fg); }
  nav button.active { color: var(--fg); font-weight: 600; }
  nav button.active :global(svg) { stroke: var(--acc); }

  .device { display: flex; align-items: flex-start; gap: 10px; padding: 10px; text-align: left; background: none; border-color: var(--line); white-space: normal; }
  .device span:last-child { display: grid; gap: 1px; min-width: 0; }
  .device small { color: var(--dim); font-size: 12px; }
  .device small.warn { color: var(--warn); }
  .dot { width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 8px var(--ok); flex: none; transition: background var(--med), box-shadow var(--med); }
  .dot.busy { background: var(--acc); box-shadow: 0 0 8px var(--acc); animation: blink 0.9s ease-in-out infinite; }
  @keyframes blink { 50% { opacity: 0.35; } }

  .content { position: relative; overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable; }
  .view { max-width: 860px; margin: 0 auto; padding: 36px 28px 96px; }
  header { margin-bottom: 18px; }
  h1 { font-size: 22px; letter-spacing: -0.02em; }
  .progress { position: sticky; top: 0; height: 2px; margin-bottom: -2px; overflow: hidden; z-index: 5; }
  .progress i { display: block; width: 40%; height: 100%; background: var(--acc); border-radius: 2px; animation: slide 1.1s var(--ease) infinite; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }

  .rail { border-left: 1px solid var(--line); background: var(--side); overflow-y: auto; padding: 36px 16px 16px; }
  @media (max-width: 900px) { .shell { grid-template-columns: 196px minmax(0, 1fr); } .rail { display: none; } }

  .toasts { position: fixed; left: 0; right: 0; bottom: 20px; display: grid; justify-items: center; gap: 8px; pointer-events: none; z-index: 20; }
  .toast {
    pointer-events: auto; max-width: min(560px, 80vw); padding: 10px 16px; border-radius: 12px; background: #1e2430; white-space: normal;
    border: 1px solid var(--line2); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5); display: flex; gap: 14px; align-items: center; text-align: left;
  }
  .toast.good { border-color: color-mix(in srgb, var(--ok) 50%, transparent); }
  .toast.good::before { content: '✓'; color: var(--ok); font-weight: 700; }
  .toast.bad { border-color: color-mix(in srgb, var(--err) 60%, transparent); color: #ffd9d9; }
  .toast em { font-style: normal; color: var(--dim); font-size: 12px; }

  .empty { height: 100vh; display: grid; place-content: center; justify-items: center; gap: 16px; text-align: center; padding: 0 24px; }
  .empty h2 { font-size: 20px; letter-spacing: -0.01em; }
  .empty ol { margin: 0; padding-left: 18px; line-height: 1.9; color: var(--dim); text-align: left; max-width: 460px; }
  .empty b { color: var(--fg); }
  .err { color: var(--err); max-width: 460px; }
  .pulse { position: relative; width: 84px; height: 84px; display: grid; place-items: center; margin-bottom: 4px; }
  .pulse i { width: 14px; height: 14px; border-radius: 50%; background: var(--acc); box-shadow: 0 0 18px var(--acc); }
  .pulse span { position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid var(--acc); opacity: 0; animation: ring 2.4s ease-out infinite; }
  .pulse span + span { animation-delay: 1.2s; }
  @keyframes ring { from { transform: scale(0.2); opacity: 0.8; } to { transform: scale(1); opacity: 0; } }
</style>
