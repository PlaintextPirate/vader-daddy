<script lang="ts">
  import Icon from './Icon.svelte';
  import { fly } from 'svelte/transition';
  import Seg from './Seg.svelte';
  import Slider from './Slider.svelte';
  import { app } from '$lib/classic/state.svelte';
  import {
    decodeLed, hexToRgb, rgbToHex, makeSteady, makeAnimated, gridOf, LedMode, PRESETS,
    LED_COUNT, MAX_KEYFRAMES, type LedConfig, type Rgb
  } from '$lib/protocol/led';
  import { fromHex } from '$lib/protocol/bytes';
  import { FACTORY_RAINBOW_LED_HEX } from '$lib/protocol/fixtures';

  const LEDS = Array.from({ length: LED_COUNT }, (_, i) => i);

  let slot = $state(0);
  const current = $derived(app.leds[slot]);

  let kind = $state<'steady' | 'animated'>('steady');
  let brightness = $state(15);

  // Steady: one colour for all LEDs, or one each.
  let perLed = $state(false);
  let colour = $state('#ff5000');
  let ledColours = $state<string[]>(LEDS.map(() => '#ff5000'));

  // Animated: grid[led][keyframe] of hex colours; every LED has the same number of keyframes.
  let grid = $state<string[][]>(PRESETS.rainbow.build([]).map((l) => l.map(rgbToHex)));
  let speed = $state(16);
  let preset = $state('rainbow');
  let presetColours = $state<string[]>(['#ff5000', '#0050ff', '#00ff60']);
  const keyframes = $derived(grid[0].length);

  // Load the editor from what's on the controller (once per slot, and again after a re-read).
  let loaded: LedConfig | undefined;
  $effect(() => {
    if (!current || current === loaded) return;
    loaded = current;
    const g = gridOf(current).map((l) => l.map(rgbToHex));
    brightness = current.brightness;
    if (current.mode === LedMode.Steady) {
      kind = 'steady';
      ledColours = g.map((l) => l[0]);
      colour = ledColours[0];
      perLed = ledColours.some((c) => c !== colour);
    } else {
      kind = 'animated';
      grid = g;
      speed = current.loopTime || 16;
      preset = 'custom';
    }
  });

  function applyPreset() {
    const p = PRESETS[preset];
    if (!p) return;
    grid = p.build(presetColours.slice(0, Math.max(p.colours, 1)).map(hexToRgb)).map((l) => l.map(rgbToHex));
  }
  function addKeyframe() {
    if (keyframes < MAX_KEYFRAMES) { grid = grid.map((l) => [...l, l[l.length - 1]]); preset = 'custom'; }
  }
  function removeKeyframe() {
    if (keyframes > 2) { grid = grid.map((l) => l.slice(0, -1)); preset = 'custom'; }
  }

  function save() {
    if (!current) return;
    const cfg = kind === 'steady'
      ? makeSteady(current, perLed ? ledColours.map(hexToRgb) : hexToRgb(colour), brightness)
      : makeAnimated(current, grid.map((l) => l.map(hexToRgb)), speed, brightness);
    app.saveLed(slot, cfg);
  }
  function saveRainbow() {
    if (!current) return;
    app.saveLed(slot, { ...decodeLed(fromHex(FACTORY_RAINBOW_LED_HEX)), brightness } satisfies LedConfig);
  }

  // On-screen preview, painted straight onto the five dots: it fades between keyframes and treats one speed
  // unit as 60 ms.
  let dots = $state<HTMLElement[]>([]);
  const mix = (a: Rgb, b: Rgb, f: number) => a.map((v, i) => Math.round(v + (b[i] - v) * f)) as Rgb;
  function show(colours: string[]) {
    colours.forEach((c, i) => { const d = dots[i]; if (d) { d.style.background = c; d.style.color = c; } });
  }
  $effect(() => { if (kind === 'steady') show(perLed ? ledColours : LEDS.map(() => colour)); });
  $effect(() => {
    if (kind !== 'animated') return;
    const rgb = grid.map((l) => l.map(hexToRgb)), frames = keyframes, step = Math.max(speed, 1) * 60;
    let raf = requestAnimationFrame(function tick(t) {
      const pos = (t / step) % frames, k = Math.floor(pos);
      show(rgb.map((l) => rgbToHex(mix(l[k], l[(k + 1) % frames], pos - k))));
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  });

  const modeName = (m: number) => (m === LedMode.Steady ? 'Steady' : m === LedMode.Animated ? 'Animated' : `Mode ${m}`);
</script>

<div class="stack">
  <div class="card">
    <div class="row head">
      <Seg options={[{ id: 'steady', name: 'Steady' }, { id: 'animated', name: 'Animated' }]} bind:value={kind} />
      <span class="grow"></span>
      <button onclick={saveRainbow} disabled={!current || !!app.busy || !app.canSaveLighting}>Factory rainbow</button>
      <button class="primary" onclick={save} disabled={!current || !!app.busy || !app.canSaveLighting}>Save to controller</button>
    </div>

    <div class="strip" style="opacity:{0.3 + (brightness / 100) * 0.7}">
      {#each LEDS as l}<span bind:this={dots[l]}></span>{/each}
    </div>

    {#key kind}
      <div class="stack" in:fly={{ y: 8, duration: 220 }}>
        {#if kind === 'steady'}
          <div class="row">
            {#if perLed}
              {#each LEDS as l}<label class="led"><input type="color" bind:value={ledColours[l]} />LED {l + 1}</label>{/each}
            {:else}
              <input type="color" class="big" bind:value={colour} />
              <code>{colour}</code>
            {/if}
          </div>
          <label class="check"><input type="checkbox" bind:checked={perLed} onchange={() => { if (perLed) ledColours = LEDS.map(() => colour); }} /> A different colour for each LED</label>
        {:else}
          <div class="row">
            <label class="row inline">Start from
              <select bind:value={preset} onchange={applyPreset}>
                {#each Object.entries(PRESETS) as [id, p]}<option value={id}>{p.name}</option>{/each}
                <option value="custom">Custom</option>
              </select>
            </label>
            {#each Array.from({ length: PRESETS[preset]?.colours ?? 0 }, (_, i) => i) as i}
              <input type="color" bind:value={presetColours[i]} oninput={applyPreset} />
            {/each}
          </div>

          <div class="keys">
            <div class="keyrow labels"><span></span>{#each grid[0] as _, k}<span>{k + 1}</span>{/each}</div>
            {#each LEDS as l}
              <div class="keyrow">
                <span>LED {l + 1}</span>
                {#each grid[l] as _, k}<input type="color" bind:value={grid[l][k]} oninput={() => (preset = 'custom')} />{/each}
              </div>
            {/each}
          </div>
          <div class="row">
            <button onclick={addKeyframe} disabled={keyframes >= MAX_KEYFRAMES}>+ Step</button>
            <button onclick={removeKeyframe} disabled={keyframes <= 2}>− Step</button>
            <span class="hint">{keyframes} of {MAX_KEYFRAMES} steps. Each row is one LED; columns play left to right, then loop.</span>
          </div>
          <Slider label="Time per step" hint="higher is slower" min={1} max={100} bind:value={speed} />
        {/if}
        <Slider label="Brightness" bind:value={brightness} />
      </div>
    {/key}
    {#if !app.canSaveLighting}<p class="hint warn">Lighting can't be saved over the dongle in DInput mode. Switch the controller to XInput mode, or plug in the cable.</p>{/if}
  </div>

  <div class="card">
    <div class="row head">
      <h3><Icon name="chip" />On the controller</h3>
      <span class="grow"></span>
      <label class="row inline hint">Slot
        <select bind:value={slot} onchange={() => !app.leds[slot] && app.readSlot(slot)}>
          {#each [0, 1, 2, 3] as s}<option value={s}>{s}{s === 0 ? ' (active)' : ''}</option>{/each}
        </select>
      </label>
      <button class="ghost" onclick={() => app.readSlot(slot)} disabled={!!app.busy}>Re-read</button>
    </div>
    {#if current}
      <p class="hint">{modeName(current.mode)} · brightness {current.brightness}{#if current.mode !== LedMode.Steady} · {current.loopEnd + 1} steps, time per step {current.loopTime}{/if}</p>
      <div class="frames">
        {#each gridOf(current) as keys, l}
          <div class="frame"><em>LED {l + 1}</em>{#each keys as c}<span style="background: rgb({c.join(',')})"></span>{/each}</div>
        {/each}
      </div>
    {:else}
      <p class="hint">Not read yet.</p>
    {/if}
  </div>
</div>

<style>
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .inline { gap: 8px; flex-wrap: nowrap; }
  .head h3 { margin: 0; }
  .strip { display: flex; gap: 16px; justify-content: center; margin: 22px auto 24px; padding: 16px 26px; width: fit-content; border-radius: 99px; background: #07080b; border: 1px solid var(--line); transition: opacity 200ms ease; }
  .strip span { width: 30px; height: 30px; border-radius: 50%; box-shadow: 0 0 22px currentColor, 0 0 4px currentColor; }
  .big { width: 56px; height: 40px; }
  .led { display: grid; gap: 4px; justify-items: center; color: var(--dim); font-size: 12px; }
  .check { display: flex; gap: 10px; align-items: center; }
  .keys { display: grid; gap: 5px; overflow-x: auto; padding-bottom: 2px; }
  .keyrow { display: grid; grid-template-columns: 48px repeat(10, 34px); gap: 5px; align-items: center; color: var(--dim); font-size: 12px; }
  .labels span { text-align: center; }
  .warn { color: var(--warn); margin-top: 14px; }
  .frames { display: grid; gap: 4px; margin-top: 12px; }
  .frame { display: flex; gap: 4px; align-items: center; }
  .frame em { width: 44px; font-style: normal; color: var(--dim); font-size: 12px; }
  .frame span { width: 22px; height: 12px; border-radius: 3px; border: 1px solid var(--line); }
</style>
