<script lang="ts">
  import Icon from './Icon.svelte';
  import { flip } from 'svelte/animate';
  import { fade, slide } from 'svelte/transition';
  import { app } from '$lib/classic/state.svelte';
  import Seg from './Seg.svelte';
  import { KEY_NAMES, REMAPPABLE, MACRO_BUTTONS, MACRO_UNITS, MAX_MACROS, macroUnits, type ProfileConfig, type MacroAction } from '$lib/protocol/config';
  import { bindingOf, setBinding, macroOfScript, matches, type Behaviour, type Binding, type Script } from '$lib/protocol/bindings';

  let { draft = $bindable() }: { draft: ProfileConfig } = $props();

  const SCRIPTS_KEY = 'vaderdaddy.scripts.v1';
  const EXTRA = [19, 18, 21, 20, 16, 17]; // M1, M2, M3, M4, C, Z
  const MODES = [
    { id: 'once', name: 'plays once per press' },
    { id: 'repeat', name: 'repeats while held' },
    { id: 'toggle', name: 'press to start, press again to stop' }
  ] as const;

  let scripts = $state<Script[]>((() => { try { return JSON.parse(localStorage.getItem(SCRIPTS_KEY) ?? '[]'); } catch { return []; } })());
  let openScript = $state<string | null>(null);
  let showAll = $state(false);
  const keys = $derived(showAll ? REMAPPABLE : EXTRA);
  const used = $derived(macroUnits(draft.macros));

  $effect(() => { try { localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts)); } catch { /* storage unavailable */ } });

  /** The library script whose content is on this button, if any. */
  const scriptOn = (key: number) => {
    const m = draft.macros.find((x) => x.trigger === key);
    return m ? scripts.find((s) => matches(m, s)) : undefined;
  };
  /** What the "Acts as" dropdown shows for a button. */
  function choice(b: Binding, key: number) {
    if (b.kind === 'default') return 'default';
    if (b.kind === 'script') return scriptOn(key)?.id ?? 'controller';
    return b.buttons.length === 1 ? `b${b.buttons[0]}` : 'combo';
  }

  function apply(key: number, b: Binding) {
    try { setBinding(draft, key, b); app.error = null; }
    catch (e) { app.error = e instanceof Error ? e.message : String(e); }
  }
  function choose(key: number, v: string) {
    const cur = bindingOf(draft, key);
    if (v === 'default') apply(key, { ...cur, kind: 'default', buttons: [] });
    else if (v === 'combo') apply(key, { ...cur, kind: 'buttons', buttons: cur.kind === 'buttons' && cur.buttons.length > 1 ? cur.buttons : [4, 5], behaviour: cur.kind === 'buttons' ? cur.behaviour : 'hold' });
    else if (v.startsWith('b')) apply(key, { ...cur, kind: 'buttons', buttons: [+v.slice(1)], behaviour: cur.kind === 'buttons' ? cur.behaviour : 'hold' });
    else { const s = scripts.find((x) => x.id === v); if (s) apply(key, { ...cur, kind: 'script', buttons: [], script: s }); }
  }
  function toggleButton(key: number, button: number) {
    const cur = bindingOf(draft, key);
    const buttons = cur.buttons.includes(button) ? cur.buttons.filter((x) => x !== button) : [...cur.buttons, button];
    if (buttons.length) apply(key, { ...cur, buttons });
  }
  function setBehaviour(key: number, behaviour: Behaviour) {
    const cur = bindingOf(draft, key);
    apply(key, { ...cur, behaviour, turbo: behaviour === 'turbo' ? (cur.buttons.length === 1 ? 5 : 100) : cur.turbo });
  }

  // ---- scripts
  const length = (s: Script) => Math.max(10, ...s.actions.map((a) => a.startMs + a.holdMs));
  const usedBy = (s: Script) => draft.macros.filter((m) => matches(m, s)).map((m) => KEY_NAMES[m.trigger]);

  function newScript() {
    const s: Script = { id: crypto.randomUUID(), name: `Script ${scripts.length + 1}`, mode: 'once', cycleMs: 30, actions: [{ button: 4, startMs: 0, holdMs: 100 }] };
    scripts.push(s);
    openScript = s.id;
  }
  /** Change a script and carry the change to every button that runs it. */
  function edit(s: Script, change: () => void) {
    const triggers = draft.macros.filter((m) => matches(m, s)).map((m) => m.trigger);
    change();
    for (const t of triggers) apply(t, { kind: 'script', buttons: [], behaviour: 'hold', turbo: 5, script: s });
  }
  function addStep(s: Script, together: boolean) {
    edit(s, () => {
      const last = s.actions[s.actions.length - 1];
      const startMs = !last ? 0 : together ? last.startMs : last.startMs + last.holdMs + 50;
      const taken = new Set(s.actions.filter((a) => a.startMs === startMs).map((a) => a.button));
      s.actions.push({ button: MACRO_BUTTONS.find((b) => !taken.has(b)) ?? 4, startMs, holdMs: last?.holdMs ?? 100 });
    });
  }
  function removeScript(s: Script) {
    for (const m of draft.macros.filter((x) => matches(x, s))) apply(m.trigger, { kind: 'default', buttons: [], behaviour: 'hold', turbo: 5 });
    scripts = scripts.filter((x) => x.id !== s.id);
  }
  function keep(key: number) {
    const b = bindingOf(draft, key);
    if (!b.script) return;
    const s: Script = { ...b.script, id: crypto.randomUUID(), name: `From ${KEY_NAMES[key]}` };
    scripts.push(s);
    openScript = s.id;
  }
  const BEHAVIOURS: { id: Behaviour; name: string }[] = [{ id: 'hold', name: 'Hold' }, { id: 'toggle', name: 'Toggle' }, { id: 'turbo', name: 'Turbo' }];
  const num = (e: Event) => Math.max(0, Math.round(+(e.currentTarget as HTMLInputElement).value / 10) * 10);
</script>

<div class="card" id="sec-buttons">
  <div class="head">
    <h3><Icon name="buttons" />Buttons</h3>
    <span class="hint" class:over={used > MACRO_UNITS || draft.macros.length > MAX_MACROS}>
      {draft.macros.length} of {MAX_MACROS} macro slots · {used} of {MACRO_UNITS} steps
    </span>
    <label class="check hint">Every button <input type="checkbox" bind:checked={showAll} /></label>
  </div>

  {#each keys as k (k)}
    {@const b = bindingOf(draft, k)}
    {@const c = choice(b, k)}
    <div class="binding" transition:slide={{ duration: 200 }}>
      <div class="row">
        <b class="name" class:set={b.kind !== 'default'}>{KEY_NAMES[k]}</b>
        <select class="target" value={c} onchange={(e) => choose(k, e.currentTarget.value)}>
          <option value="default">{EXTRA.includes(k) ? 'Nothing' : 'Itself'}</option>
          <optgroup label="A button">
            {#each MACRO_BUTTONS.filter((t) => t !== k) as t}<option value={`b${t}`}>{KEY_NAMES[t]}</option>{/each}
          </optgroup>
          <option value="combo">Several buttons at once…</option>
          {#if scripts.length || c === 'controller'}
            <optgroup label="A script">
              {#each scripts as s}<option value={s.id}>{s.name}</option>{/each}
              {#if c === 'controller'}<option value="controller">Script on the controller (not in your list)</option>{/if}
            </optgroup>
          {/if}
        </select>

        {#if b.kind === 'buttons'}
          <span in:fade={{ duration: 160 }}><Seg small options={BEHAVIOURS} value={b.behaviour} onchange={(v) => setBehaviour(k, v)} /></span>
          {#if b.behaviour === 'turbo'}
            {#if b.buttons.length === 1}
              <label class="mini" in:fade={{ duration: 160 }}>speed <input type="number" min="1" max="50" value={b.turbo} onchange={(e) => apply(k, { ...b, turbo: +e.currentTarget.value })} /></label>
            {:else}
              <label class="mini" in:fade={{ duration: 160 }}>every <input type="number" min="40" max="2500" step="10" value={b.turbo} onchange={(e) => apply(k, { ...b, turbo: Math.max(40, num(e)) })} /> ms</label>
            {/if}
          {/if}
        {:else if b.kind === 'script'}
          <span class="hint" in:fade={{ duration: 160 }}>{MODES.find((m) => m.id === b.script?.mode)?.name}</span>
          {#if c === 'controller'}<button class="ghost" onclick={() => keep(k)}>Add to my scripts</button>{/if}
        {/if}
      </div>
      {#if c === 'combo'}
        <div class="chips" transition:slide={{ duration: 200 }}>
          {#each MACRO_BUTTONS as t}
            <button class="chip" class:on={b.buttons.includes(t)} onclick={() => toggleButton(k, t)}>{KEY_NAMES[t]}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}

  <p class="hint foot">
    <b>Hold</b>: pressed for as long as you hold. <b>Toggle</b>: one press holds it down, the next lets go. <b>Turbo</b>: rapid presses while held.
    One button on Hold or Turbo is free; combos, toggles and scripts each take one of the controller's {MAX_MACROS} macro slots.
    All of this applies in XInput mode. In DInput, M1–M4, C and Z reach the computer as plain buttons.
  </p>
</div>

<div class="card" id="sec-scripts">
  <div class="head">
    <h3><Icon name="scripts" />Scripts</h3>
    <span class="hint">Timed button presses you can assign to a button above. Kept in this app.</span>
    <button onclick={newScript}>+ Script</button>
  </div>

  {#each scripts as s (s.id)}
    {@const open = openScript === s.id}
    <div class="script" class:open animate:flip={{ duration: 240 }} transition:slide={{ duration: 200 }}>
      <div class="srow">
        <button class="ghost twist" class:open onclick={() => (openScript = open ? null : s.id)} aria-label={open ? 'Close' : 'Edit'}>
          <svg viewBox="0 0 10 10"><path d="M3 1.500l4 3.500-4 3.500" /></svg>
        </button>
        <input class="title" value={s.name} onchange={(e) => (s.name = e.currentTarget.value || s.name)} />
        <span class="hint">{s.actions.length} press{s.actions.length === 1 ? '' : 'es'}, {length(s)} ms{usedBy(s).length ? ` · on ${usedBy(s).join(', ')}` : ''}</span>
        <span class="grow"></span>
        <button class="ghost" onclick={() => removeScript(s)}>Delete</button>
      </div>
      {#if open}
        <div class="editor" transition:slide={{ duration: 240 }}>
          <div class="srow">
            <label class="mini">It
              <select value={s.mode} onchange={(e) => edit(s, () => (s.mode = e.currentTarget.value as Script['mode']))}>
                {#each MODES as m}<option value={m.id}>{m.name}</option>{/each}
              </select>
            </label>
            {#if s.mode !== 'once'}
              <!-- The controller counts in 10 ms steps, and a pause of 0 means no release at all (a solid hold). -->
              <label class="mini">pause between repeats <input type="number" min="10" max="2540" step="10" value={s.cycleMs} onchange={(e) => { const v = Math.min(2540, Math.max(10, num(e))); edit(s, () => (s.cycleMs = v)); e.currentTarget.value = String(v); }} /> ms</label>
              <span class="hint">about {Math.round(1000 / (length(s) + s.cycleMs))} times a second</span>
            {/if}
          </div>
          <div class="timeline">
            {#each s.actions as a}
              <div class="lane"><span>{KEY_NAMES[a.button]}</span>
                <div class="track"><i style="left:{(a.startMs / length(s)) * 100}%; width:{Math.max(1, (a.holdMs / length(s)) * 100)}%"></i></div>
              </div>
            {/each}
            <div class="scale hint"><span></span>0 ms<span></span>{length(s)} ms</div>
          </div>
          {#each s.actions as a, ai}
            <div class="srow">
              <select value={a.button} onchange={(e) => edit(s, () => (a.button = +e.currentTarget.value))}>{#each MACRO_BUTTONS as t}<option value={t}>{KEY_NAMES[t]}</option>{/each}</select>
              <label class="mini">starts at <input type="number" min="0" max="60000" step="10" value={a.startMs} onchange={(e) => { const v = num(e); edit(s, () => (a.startMs = v)); e.currentTarget.value = String(v); }} /> ms</label>
              <label class="mini">held for <input type="number" min="10" max="60000" step="10" value={a.holdMs} onchange={(e) => { const v = Math.max(10, num(e)); edit(s, () => (a.holdMs = v)); e.currentTarget.value = String(v); }} /> ms</label>
              <button class="ghost" onclick={() => edit(s, () => s.actions.splice(ai, 1))} disabled={s.actions.length <= 1} aria-label="Remove">✕</button>
            </div>
          {/each}
          <div class="srow">
            <button onclick={() => addStep(s, false)}>+ Next button</button>
            <button onclick={() => addStep(s, true)}>+ Button at the same time</button>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <p class="hint">No scripts yet. A script is a short sequence, for example A, then B a moment later. Times are in steps of 10 ms.</p>
  {/each}
</div>

<style>
  .head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 10px; }
  .head h3 { margin: 0; display: flex; align-items: center; gap: 8px; }
  .head .hint { flex: 1; }
  .head .check { flex: none; }
  .over { color: var(--err); }
  .check { display: flex; gap: 8px; align-items: center; }
  .binding { border-top: 1px solid var(--line); }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 0; min-height: 34px; }
  .name { width: 64px; transition: color var(--med) ease; }
  .name.set { color: var(--acc); }
  .target { width: 210px; }
  .mini { display: flex; align-items: center; gap: 6px; color: var(--dim); }
  .mini input { width: 72px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 0 10px 74px; }
  .chip { padding: 3px 11px; border-radius: 99px; font-size: 12.5px; }
  .chip.on, .chip.on:hover { background: var(--acc); color: var(--on-acc); border-color: var(--acc); font-weight: 600; }
  .foot { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
  .script { border-top: 1px solid var(--line); padding: 8px 0; }
  .editor { display: grid; gap: 10px; padding: 10px 0 6px 38px; }
  .srow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .twist { padding: 6px 8px; }
  .twist svg { display: block; width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; transition: transform var(--med) var(--ease); }
  .twist.open svg { transform: rotate(90deg); }
  .title { width: 190px; font-weight: 600; background: transparent; border-color: transparent; }
  .title:hover { border-color: var(--line2); }
  .timeline { display: grid; gap: 4px; padding: 10px 12px; background: var(--bg); border-radius: 10px; }
  .lane { display: grid; grid-template-columns: 60px 1fr; gap: 8px; align-items: center; font-size: 12px; color: var(--dim); }
  .track { position: relative; height: 10px; background: var(--line); border-radius: 5px; }
  .track i { position: absolute; top: 0; bottom: 0; background: var(--acc); border-radius: 5px; transition: left var(--med) var(--ease), width var(--med) var(--ease); }
  .scale { display: grid; grid-template-columns: 60px auto 1fr auto; gap: 8px; font-size: 11.5px; }
</style>
