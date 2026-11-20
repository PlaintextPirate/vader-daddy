<!-- ?debug only (loaded with a dynamic import, so it is not in the normal bundle path): frame-time stats from a
     requestAnimationFrame sampler (average and worst of the last 120 frames) and the input bus status. Updates
     its text twice a second; the sampler itself writes nothing to the DOM. -->
<script lang="ts">
  import type { InputBus } from '$lib/device/input';

  let { bus }: { bus: InputBus } = $props();
  const N = 120;
  let text = $state('');

  $effect(() => {
    const times = new Float64Array(N);
    let i = 0, n = 0, last = performance.now(), raf = 0;
    const frame = (t: number) => {
      times[i] = t - last; last = t; i = (i + 1) % N; n = Math.min(N, n + 1);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const show = setInterval(() => {
      let sum = 0, worst = 0, slow = 0;
      for (let k = 0; k < n; k++) { sum += times[k]; worst = Math.max(worst, times[k]); if (times[k] > 16.7) slow++; }
      const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
      text = `${(sum / Math.max(1, n)).toFixed(1)} ms avg · ${worst.toFixed(1)} worst · ${slow}/${n} slow · input ${bus.status}/${bus.transport}` +
        (heap ? ` · ${(heap / 1048576).toFixed(1)} MB` : '');
    }, 500);
    return () => { cancelAnimationFrame(raf); clearInterval(show); };
  });
</script>

<div class="badge" aria-hidden="true">{text}</div>

<style>
  .badge {
    position: fixed; left: 8px; bottom: 8px; z-index: 100; padding: 3px 8px; border-radius: 6px;
    background: rgba(27, 35, 48, 0.82); color: #fff; font: 11px/1.4 var(--font-mono); pointer-events: none;
    contain: layout paint;
  }
</style>
