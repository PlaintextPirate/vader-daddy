<!--
  The Vader 4 Pro drawing: one inline SVG (viewBox 0 -20 720 490), hand-authored from docs/redesign/v2/controller.svg.
  Every interactive part is <g data-part> with its shapes, a .ring (selection/focus contour) and a transparent .hit
  (role=button). State is classes only: .is-selected here, .is-pressed and the stick/trigger transforms from live.ts.
-->
<script lang="ts">
  import { PARTS, type PartId } from './parts';
  import { copy, fmt } from '$lib/copy';

  type Caption = { line1: string; line2?: string; muted?: boolean };
  type Paddle = 'm1' | 'm2' | 'm3' | 'm4';

  let {
    selected = null,
    onselect,
    dim = false,
    leds,
    ledLevel = 1, ledFade = 0,
    ledHover = null,
    captions = {},
    interactive = true,
    names = {},
    svg = $bindable()
  }: {
    selected?: PartId | null;
    onselect?: (part: PartId) => void;
    dim?: boolean;
    leds?: string[];
    /** How bright the LEDs are drawn, 0 (off) to 1. */
    ledLevel?: number;
    /** Milliseconds an LED takes to fade to a new colour; 0 changes at once. */
    ledFade?: number;
    ledHover?: number | null;
    captions?: Partial<Record<Paddle, Caption>>;
    interactive?: boolean;
    /** Accessible names that say what a part does ("M3, B, turbo"); the part's own name otherwise. */
    names?: Partial<Record<PartId, string>>;
    /** The <svg> element, for attachLive(). */
    svg?: SVGSVGElement;
  } = $props();

  const uid = $props.id();
  const u = (n: string) => `${uid}-${n}`;
  const url = (n: string) => `url(#${uid}-${n})`;

  const ACCENT = '#FF7A2F';
  const ledStyle = $derived(
    Array.from({ length: 5 }, (_, i) => `--led${i}:${leds?.[i] ?? `var(--c-accent, ${ACCENT})`}`).join(';') +
      `;--led-level:${Math.min(1, Math.max(0, ledLevel))};--led-fade:${Math.max(0, ledFade)}ms;--focus-filter:url(#${uid}-focus)`
  );
  const live = $derived(interactive && !dim);

  /** Mirror an absolute M/L/C/Q/Z path around x = 360. */
  function mirror(d: string): string {
    let i = 0;
    return d.replace(/[MLCQZ]|-?\d*\.?\d+/g, (t) => {
      if (/[A-Z]/.test(t)) { i = 0; return t; }
      return i++ % 2 === 0 ? String(+(720 - +t).toFixed(2)) : t;
    });
  }

  const BODY =
    'M200 56C262 47 304 45 360 45C416 45 458 47 520 56C602 63 646 98 668 160C690 222 710 296 716 356C722 424 688 464 638 464C598 464 576 438 554 402C536 370 514 354 476 354L244 354C206 354 184 370 166 402C144 438 122 464 82 464C32 464 -2 424 4 356C10 296 30 222 52 160C74 98 118 63 200 56Z';
  const TRIG_L =
    'M131 63.3L123.5 45.2Q128.4 42.6 131.7 38.2L150 6.6C155.5 -2.5 160.5 -7 171 -8.5L233.6 -16.4C241 -17.2 246 -12 246.9 -5.7L251.5 41.6L172 51.6Q150 56.5 131 63.3Z';
  const BUMP_L =
    'M80 133.4C86 118 92 96 100.6 82.1C108 70 118 62.5 131.9 57C150 50.5 166 47 182.9 44.3L239.5 37.3C258 35.5 270 33.5 280.3 35.5C286 36.8 292 39.8 321.9 56.2C328 59.5 338 63 350 70';
  const TRIG_R = mirror(TRIG_L), BUMP_R = mirror(BUMP_L);
  const TRIGS = [
    { id: 'lt', d: TRIG_L, s: 'l', x: 120, tx: 200 },
    { id: 'rt', d: TRIG_R, s: 'r', x: 465, tx: 520 }
  ] as const;
  const BUMPS = [
    { id: 'lb', d: BUMP_L, tx: 205.7, trig: 'lt' },
    { id: 'rb', d: BUMP_R, tx: 514.3, trig: 'rt' }
  ] as const;
  const DPAD =
    'M277.8 221H292.2Q300 221 300 228.8V249H320.2Q328 249 328 256.8V271.2Q328 279 320.2 279H300V299.2Q300 307 292.2 307H277.8Q270 307 270 299.2V279H249.8Q242 279 242 271.2V256.8Q242 249 249.8 249H270V228.8Q270 221 277.8 221Z';
  const V = 'M282 72L360 130L438 72';
  const SEGS = [
    'M282 72L306.96 90.56', 'M313.98 95.78L337.38 113.18', 'M344.4 118.4L360 130L375.6 118.4',
    'M382.62 113.18L406.02 95.78', 'M413.04 90.56L438 72'
  ];
  /**
   * Where each LED of the lighting data sits on the controller: LED_SEG[led] is its segment, counted left to
   * right as drawn. The data is shifted by two against the V (checked by eye with five colours, 2026-11-20):
   * LED 1 is the middle, 2 and 3 the right arm, 4 and 5 the left arm.
   */
  const LED_SEG = [2, 3, 4, 0, 1];
  const SEG_LED = LED_SEG.map((_, seg) => LED_SEG.indexOf(seg));
  /** Middle of each LED segment, for the hover callout's leader. */
  const SEG_MID = [[294.5, 81.3], [325.7, 104.5], [360, 125], [394.3, 104.5], [425.5, 81.3]] as const;
  /** Centre line of the "LED n" callout chip, above the body. */
  const CALLOUT_Y = 24;
  const hoverMid = $derived(ledHover != null && ledHover >= 0 && ledHover < LED_SEG.length ? SEG_MID[LED_SEG[ledHover]] : null);
  /** Region below the body's lower edge: paddles show only here. */
  const BELOW = 'M120 470L166 402.8C184 370.8 206 354.8 244 354.8L476 354.8C514 354.8 536 370.8 554 402.8L600 470Z';

  const FACE = [
    { id: 'y', cx: 545, cy: 124, r: 22 },
    { id: 'x', cx: 504, cy: 165, r: 22 },
    { id: 'b', cx: 586, cy: 165, r: 22 },
    { id: 'a', cx: 545, cy: 206, r: 22 },
    { id: 'z', cx: 625.56, cy: 225.19, r: 18 },
    { id: 'c', cx: 577.04, cy: 267.68, r: 18 }
  ] as const;
  const STICKS = [
    { id: 'ls', s: 'l', cx: 190, cy: 164 },
    { id: 'rs', s: 'r', cx: 430, cy: 264 }
  ] as const;
  const PILLS = [
    { id: 'select', d: 'M296.6 112.2L317.4 127.8', tx: 307, hx: 284 },
    { id: 'start', d: 'M402.6 127.8L423.4 112.2', tx: 413, hx: 389 }
  ] as const;
  const PADDLES = [
    { id: 'm1', x: 219, h: 98 },
    { id: 'm3', x: 292, h: 74 },
    { id: 'm4', x: 365, h: 74 },
    { id: 'm2', x: 438, h: 98 }
  ] as const;

  const CENTRE = [{ id: 'capture', cx: 344 }, { id: 'home', cx: 376 }] as const;

  function hit(id: PartId) {
    return {
      role: 'button',
      tabindex: live ? 0 : -1,
      'aria-label': names[id] ?? PARTS[id].name,
      'aria-pressed': selected === id,
      'aria-disabled': live ? undefined : true,
      onclick: () => { if (live) onselect?.(id); },
      onkeydown: (e: KeyboardEvent) => {
        if (live && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onselect?.(id); }
      }
    };
  }
  const btn = (id: PartId) => PARTS[id].stream.join(' ') || undefined;
</script>

<div class="ctl" class:is-dim={dim} class:is-live={live} style={ledStyle}>
  <svg bind:this={svg} viewBox="0 -20 720 490" role="group" aria-label="Controller" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id={u('trig')} x1="0" y1="-16" x2="0" y2="64" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#2C323D" /><stop offset="1" stop-color="#252A34" />
      </linearGradient>
      <linearGradient id={u('bump')} x1="0" y1="20" x2="0" y2="150" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#4B5364" /><stop offset="1" stop-color="#3E4554" />
      </linearGradient>
      <linearGradient id={u('body')} x1="216" y1="0" x2="504" y2="470" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#3B424F" /><stop offset="1" stop-color="#1B1F26" />
      </linearGradient>
      <radialGradient id={u('sheen')} cx="300" cy="165" r="170" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fff" stop-opacity=".08" /><stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
      <linearGradient id={u('silver')} x1=".2" y1="0" x2=".8" y2="1">
        <stop offset="0" stop-color="#EEF1F6" /><stop offset="1" stop-color="#7A8494" />
      </linearGradient>
      <linearGradient id={u('cap')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4A5262" /><stop offset="1" stop-color="#22262D" />
      </linearGradient>
      <linearGradient id={u('dish')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#262A32" /><stop offset="1" stop-color="#3A414E" />
      </linearGradient>
      <radialGradient id={u('capshade')}>
        <stop offset=".78" stop-color="#000" stop-opacity=".45" /><stop offset="1" stop-color="#000" stop-opacity="0" />
      </radialGradient>
      <linearGradient id={u('dwell')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2A2F38" /><stop offset="1" stop-color="#1A1D23" />
      </linearGradient>
      <linearGradient id={u('btn')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4A5262" /><stop offset="1" stop-color="#262A32" />
      </linearGradient>
      <linearGradient id={u('pad')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4A5262" /><stop offset="1" stop-color="#343A46" />
      </linearGradient>
      <radialGradient id={u('pglow')}>
        <stop offset=".45" stop-color="#fff" stop-opacity=".55" /><stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
      <!-- Focus: a 2 px ink edge outside the white ring, so it shows on the dark body and on the light page. -->
      <filter id={u('focus')} x="-30%" y="-30%" width="160%" height="160%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="wide" />
        <feFlood flood-color="#1B2330" />
        <feComposite in2="wide" operator="in" result="edge" />
        <feMerge><feMergeNode in="edge" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id={u('blur')} x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="14" /></filter>
      <clipPath id={u('below')}><path d={BELOW} /></clipPath>
      <clipPath id={u('cl-lt')}><path d={TRIG_L} /></clipPath>
      <clipPath id={u('cl-rt')}><path d={TRIG_R} /></clipPath>
      {#each BUMPS as b (b.id)}
        <mask id={u(`m-${b.id}`)} maskUnits="userSpaceOnUse" x="0" y="-20" width="720" height="490">
          <path class="edge" d={b.d} stroke="#fff" stroke-width="35" />
        </mask>
      {/each}
    </defs>

    <path class="shadow" d={BODY} transform="translate(0 18)" filter={url('blur')} />

    {#each TRIGS as t (t.id)}
      <g data-part={t.id} class="part" class:is-selected={selected === t.id}>
        <path d={t.d} fill={url('trig')} stroke="#535B6B" stroke-width="1.5" stroke-linejoin="round" />
        <g clip-path={url(`cl-${t.id}`)}><rect class="pull" data-pull={t.s} x={t.x} y="-17" width="135" height="81" /></g>
        <text x={t.tx} y="13.6">{PARTS[t.id].label}</text>
        <path class="ring" d={t.d} />
        <path class="hit" d={t.d} {...hit(t.id)} />
      </g>
    {/each}

    {#each BUMPS as b (b.id)}
      <g data-part={b.id} class="part" class:is-selected={selected === b.id} data-btn={btn(b.id)}>
        <path class="ring under" d={b.d} stroke-width="35" />
        <!-- A selected trigger's outline is closed along the bumper that covers its lower edge. -->
        {#if selected === b.trig}<path class="edge close" d={b.d} stroke-width="35" clip-path={url(`cl-${b.trig}`)} />{/if}
        <path class="edge" d={b.d} stroke="#535B6B" stroke-width="31" />
        <path class="edge face" d={b.d} stroke={url('bump')} stroke-width="28" />
        <text x={b.tx} y="46.3">{PARTS[b.id].label}</text>
        <path class="hit stroke" d={b.d} stroke-width="34" {...hit(b.id)} />
      </g>
    {/each}

    <path d={BODY} fill={url('body')} stroke="#535B6B" stroke-width="1.5" />
    <path d={BODY} fill={url('sheen')} />
    <!-- A selected bumper's outline is closed along the body edge that covers its lower half. -->
    {#each BUMPS as b (b.id)}
      {#if selected === b.id}<path class="close" d={BODY} fill="none" stroke-width="2.5" mask={url(`m-${b.id}`)} />{/if}
    {/each}

    <g data-part="light" class="part light" class:is-selected={selected === 'light'}>
      <path class="ring under" d={V} stroke-width="18" />
      <path class="edge" d={V} stroke="#14171C" stroke-width="13" />
      {#each SEGS as d, i (i)}
        <path class="edge led-glow" d={d} stroke-width="20" style="stroke:var(--led{SEG_LED[i]})" />
      {/each}
      {#each SEGS as d, i (i)}
        <path class="edge led-hover" class:on={ledHover === SEG_LED[i]} d={d} stroke-width="11" />
        <path class="edge led-off" d={d} stroke-width="6" />
        <path class="edge led" d={d} stroke-width="6" style="stroke:var(--led{SEG_LED[i]})" />
      {/each}
      <path class="hit stroke" d={V} stroke-width="40" {...hit('light')} />
      {#if hoverMid}
        <line class="leader" x1={hoverMid[0]} y1={CALLOUT_Y + 12} x2={hoverMid[0]} y2={hoverMid[1] - 5} />
      {/if}
    </g>

    {#each [STICKS[0]] as s (s.id)}
      {@render stick(s)}
    {/each}

    {#each PILLS as p (p.id)}
      <g data-part={p.id} class="part" class:is-selected={selected === p.id} data-btn={btn(p.id)}>
        <path class="ring under" d={p.d} stroke-width="18" />
        <path class="edge face" d={p.d} stroke="#667085" stroke-width="13" />
        <text class="small pill" x={p.tx} y="158">{PARTS[p.id].label}</text>
        <rect class="hit" x={p.hx} y="100" width="47" height="64" rx="12" {...hit(p.id)} />
      </g>
    {/each}

    {#each FACE.slice(0, 5) as f (f.id)}
      {@render face(f)}
    {/each}

    <g data-part="dpad" class="part" class:is-selected={selected === 'dpad'}>
      <circle cx="285" cy="264" r="52" fill={url('dwell')} stroke="#4B5363" stroke-width="1.5" />
      <path d={DPAD} fill="#3A414E" />
      <!-- Arms are square where they meet the middle, so two pressed together join into one shape through it. -->
      <!-- Outer edges sit 0.4 outside the cross so none of its grey shows around a lit arm; the middle overlaps
           the arms by the same amount so no seam shows between them. -->
      <path class="arm" data-btn="Up" d="M269.6 249V228.8Q269.6 220.6 277.8 220.6H292.2Q300.4 220.6 300.4 228.8V249Z" />
      <path class="arm" data-btn="Down" d="M269.6 279V299.2Q269.6 307.4 277.8 307.4H292.2Q300.4 307.4 300.4 299.2V279Z" />
      <path class="arm" data-btn="Left" d="M270 248.6H249.8Q241.6 248.6 241.6 256.8V271.2Q241.6 279.4 249.8 279.4H270Z" />
      <path class="arm" data-btn="Right" d="M300 248.6H320.2Q328.4 248.6 328.4 256.8V271.2Q328.4 279.4 320.2 279.4H300Z" />
      <path class="mid" d="M270 248.5H300V249H300.5V279H300V279.5H270V279H269.5V249H270Z" />
      <circle class="ring" cx="285" cy="264" r="53.5" />
      <circle class="hit" cx="285" cy="264" r="55" {...hit('dpad')} />
    </g>

    {#each [STICKS[1]] as s (s.id)}
      {@render stick(s)}
    {/each}
    {@render face(FACE[5])}

    {#each CENTRE as c (c.id)}
      <g data-part={c.id} class="part" class:is-selected={selected === c.id} data-btn={btn(c.id)}>
        <circle class="face" cx={c.cx} cy="322" r="12" fill="#3A414E" stroke="#5C6577" stroke-width="1.5" />
        <path class="icon" transform="translate({c.cx - 5.5} 316.5)"
          d={c.id === 'home'
            ? 'M1 5L5.5 1L10 5M2.5 4V10H8.5V4'
            : 'M2 1H9Q10 1 10 2V9Q10 10 9 10H2Q1 10 1 9V2Q1 1 2 1ZM5.5 4A1.5 1.5 0 1 1 5.5 7A1.5 1.5 0 1 1 5.5 4Z'} />
        <circle class="ring" cx={c.cx} cy="322" r="13.5" />
        <circle class="hit" cx={c.cx} cy="322" r="15.5" {...hit(c.id)} />
      </g>
    {/each}

    <g clip-path={url('below')}>
      {#each PADDLES as p (p.id)}
        <g data-part={p.id} class="part" class:is-selected={selected === p.id}>
          <rect class="face" x={p.x} y="326" width="62" height={p.h} rx="16" fill={url('pad')} stroke="#5C6577" stroke-width="1.5" />
          <text class="paddle" x={p.x + 31} y={326 + p.h - 18}>{PARTS[p.id].label}</text>
          <rect class="ring" x={p.x - 1.25} y="324.75" width="64.5" height={p.h + 2.5} rx="17.25" />
          <rect class="hit" x={p.x - 2} y="352" width="66" height={p.h - 24} rx="17" {...hit(p.id)} />
        </g>
      {/each}
    </g>
  </svg>

  {#if hoverMid && ledHover != null}
    <span class="callout" style:left="{(hoverMid[0] / 720) * 100}%" style:top="{((CALLOUT_Y + 20) / 490) * 100}%">
      {fmt(copy.light.ledN, { n: ledHover + 1 })}
    </span>
  {/if}

  {#if !dim}
    {#each PADDLES as p (p.id)}
      {@const c = captions[p.id]}
      {#if c}
        <div class="cap" class:left={p.id === 'm2'} class:muted={c.muted} aria-hidden="true"
          title={c.line2 ? `${c.line1} · ${c.line2}` : c.line1}
          style="left:{((p.id === 'm2' ? p.x : p.x + 31) / 720) * 100}%">
          <div class="l1">{c.line1}</div>
          {#if c.line2}<div class="l2">{c.line2}</div>{/if}
        </div>
      {/if}
    {/each}
  {/if}
</div>

{#snippet face(f: (typeof FACE)[number])}
  <g data-part={f.id} class="part" class:is-selected={selected === f.id} data-btn={btn(f.id)}>
    <circle class="pglow" cx={f.cx} cy={f.cy} r={f.r * 1.85} fill={url('pglow')} />
    <circle class="face" cx={f.cx} cy={f.cy} r={f.r} fill={url('btn')} stroke="#5C6577" stroke-width="1.5" />
    <text class:small={f.r < 20} x={f.cx} y={f.cy + (f.r < 20 ? 4.3 : 4.7)}>{PARTS[f.id].label}</text>
    <circle class="ring" cx={f.cx} cy={f.cy} r={f.r + 1.5} />
    <circle class="hit" cx={f.cx} cy={f.cy} r={f.r + 3} {...hit(f.id)} />
  </g>
{/snippet}

{#snippet stick(s: { id: 'ls' | 'rs'; s: 'l' | 'r'; cx: number; cy: number })}
  <g data-part={s.id} class="part stick" class:is-selected={selected === s.id} data-btn={btn(s.id)}>
    <circle cx={s.cx} cy={s.cy} r="52" fill={url('silver')} stroke="#5C6577" stroke-width="1" />
    <circle cx={s.cx} cy={s.cy} r="43" fill="#14171C" />
    <circle class="ring" cx={s.cx} cy={s.cy} r="54" />
    <g class="capg" data-stick={s.s}>
      <circle cx={s.cx + 2} cy={s.cy + 5} r="38" fill={url('capshade')} />
      <circle class="face" cx={s.cx} cy={s.cy} r="33" fill={url('cap')} stroke="#5C6577" stroke-width="1.5" />
      <circle class="dish" cx={s.cx} cy={s.cy} r="20" fill={url('dish')} stroke="#4B5363" stroke-width="1.5" />
    </g>
    <circle class="hit" cx={s.cx} cy={s.cy} r="56" {...hit(s.id)} />
  </g>
{/snippet}

<style>
  .ctl {
    position: relative;
    width: 100%;
    max-width: 960px;
    aspect-ratio: 720 / 490;
    container-type: inline-size;
    font-family: var(--font, 'Inter', -apple-system, system-ui, sans-serif);
  }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; user-select: none; -webkit-user-select: none; }

  .shadow { fill: #1C2433; opacity: 0.3; pointer-events: none; }
  .edge { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  text {
    fill: #D5DBE6; font-size: 13px; font-weight: 600; text-anchor: middle; pointer-events: none;
    transition: fill var(--t-fast, 120ms);
  }
  text.small { font-size: 12px; }
  text.paddle { fill: #fff; }
  text.pill { fill: #AEB6C4; font-weight: 500; }
  .icon { fill: none; stroke: #C9D2DE; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }

  /* LEDs */
  .led-off { stroke: #39404C; }
  .led { opacity: var(--led-level, 1); transition: stroke var(--led-fade, 0ms) linear; }
  .led-glow { opacity: calc(0.35 * var(--led-level, 1)); transition: stroke var(--led-fade, 0ms) linear; }
  .led-hover { stroke: #fff; opacity: 0; }
  .led-hover.on { opacity: 1; }
  .leader { stroke: #fff; stroke-width: 1.25; pointer-events: none; }
  .callout {
    position: absolute; transform: translate(-50%, -50%); padding: 3px 10px; border-radius: var(--r-pill, 999px);
    background: #fff; color: var(--c-ink, #1B2330); font-size: 1.806cqw; font-weight: 600; line-height: 1.35;
    white-space: nowrap; box-shadow: 0 1px 3px rgba(27, 35, 48, 0.18); pointer-events: none;
  }

  /* Trigger pull and D-pad arms (live input is white, never the accent: orange means selected) */
  .pull {
    fill: #fff; opacity: 0.4; pointer-events: none;
    transform-box: fill-box; transform-origin: 50% 100%; transform: scaleY(0);
  }
  .arm, .mid { fill: #fff; opacity: 0; pointer-events: none; }
  .close { stroke: var(--c-accent, #FF7A2F); pointer-events: none; }
  .capg { will-change: transform; }

  /* Hit shapes */
  .hit { fill: transparent; stroke: transparent; outline: none; cursor: pointer; }
  .hit.stroke { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .ctl:not(.is-live) .hit { cursor: default; pointer-events: none; }

  /* Hover: clearly lighter */
  .is-live .part:has(.hit:hover) { filter: brightness(1.35); }

  /* Selection and focus rings */
  .ring { fill: none; stroke: transparent; pointer-events: none; stroke-linecap: round; stroke-linejoin: round; }
  .ring:not(.under) { stroke-width: 2.5; }
  .stick .ring { stroke-width: 3.5; }
  .is-selected .ring { stroke: var(--c-accent, #FF7A2F); filter: drop-shadow(0 0 5px rgba(255, 122, 47, 0.65)); }
  /* Focus: a 2 px white ring following the part's contour with a 2 px ink edge outside it (the filter). */
  .part:has(.hit:focus-visible) .ring { stroke: #fff; filter: var(--focus-filter); }
  .part:has(.hit:focus-visible) .ring:not(.under) { stroke-width: 2.5; }
  .part:has(.hit:focus-visible) .ring.under { stroke-width: 36; }
  .light:has(.hit:focus-visible) .ring.under,
  [data-part='select']:has(.hit:focus-visible) .ring.under,
  [data-part='start']:has(.hit:focus-visible) .ring.under { stroke-width: 18; }
  @media (forced-colors: active) {
    .is-selected .ring, .close { stroke: Highlight; filter: none; }
    .part:has(.hit:focus-visible) .ring { stroke: CanvasText; filter: none; stroke-width: 3; }
  }

  /* Pressed (live) */
  .pglow { opacity: 0; pointer-events: none; transition: opacity var(--t-fast, 120ms); }
  .face { transition: fill var(--t-fast, 120ms), stroke var(--t-fast, 120ms); }
  .arm:global(.is-pressed) { opacity: 1; }
  .arm:global(.is-pressed) ~ .arm:global(.is-pressed) ~ .mid { opacity: 1; }
  .part:global(.is-pressed) .pglow { opacity: 1; }
  .part:global(.is-pressed) .face { fill: #fff; stroke: #fff; }
  .part:global(.is-pressed) text { fill: var(--c-ink, #1B2330); }
  .part:global(.is-pressed) .icon { stroke: var(--c-ink, #1B2330); }
  .part:global(.is-pressed) .dish { fill: #E6ECF4; stroke: #C9D2DE; }
  .part:global(.is-pressed) { filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.55)); }

  /* No controller */
  .is-dim svg { filter: contrast(0.42) brightness(1.5) saturate(1.3); }
  .is-dim .led, .is-dim .led-glow { stroke: #3A414E !important; }
  .is-dim .led-glow { opacity: 0; }

  /* Paddle captions */
  /* One line each (name, mode), cut with an ellipsis inside the paddle's column; the full text is in the title
     and in the paddle's accessible name. */
  .cap {
    position: absolute; top: calc((434 + 20) / 490 * 100%); width: calc(72 / 720 * 100%);
    transform: translateX(-50%); text-align: center; white-space: nowrap; line-height: 1.2;
  }
  .cap.left { transform: none; text-align: left; width: calc(150 / 720 * 100%); }
  .l1, .l2 { overflow: hidden; text-overflow: ellipsis; }
  .l1 { font-size: 1.945cqw; font-weight: var(--fw-semibold, 600); color: var(--c-ink, #1B2330); }
  .l2 { font-size: 1.806cqw; color: var(--c-mute, #566173); margin-top: 1px; }
  .cap.muted .l1 { color: var(--c-mute, #566173); font-weight: var(--fw-medium, 500); }
</style>
