<script lang="ts">
  import Controller from '$lib/controller/Controller.svelte';
  import { Button } from '$lib/ui';
  import { copy } from '$lib/copy';
  import { device } from '$lib/device/device.svelte';

  const connecting = $derived(device.status === 'connecting');
  const code = $derived(device.lastError?.code);
  const serviceDown = $derived(code === 'service_down');
  const title = $derived(
    serviceDown ? copy.empty.serviceTitle : code === 'no_helper' ? copy.empty.helperTitle : code === 'unsupported' ? copy.empty.otherTitle : copy.empty.title
  );
  const body = $derived(
    serviceDown ? copy.empty.serviceBody : code === 'no_helper' ? copy.empty.helperBody : code === 'unsupported' ? copy.empty.otherBody : copy.empty.body
  );
</script>

<section class="empty" aria-labelledby="empty-title">
  <div class="ctl"><Controller dim interactive={false} /></div>
  <h1 id="empty-title">{title}</h1>
  <p class="body">{body}</p>
  {#if code === 'no_helper'}<code class="cmd">{copy.empty.helperCommand}</code>{/if}
  <Button variant="dark" onclick={() => device.connect()} disabled={connecting || !!device.busy}>
    {connecting ? copy.empty.connecting : copy.empty.connect}
  </Button>
  {#if code === 'no_helper'}<p class="help">{copy.empty.helperHelp}</p>{:else if !serviceDown && code !== 'unsupported'}<p class="help">{copy.empty.help}</p>{/if}
</section>

<style>
  .empty {
    position: absolute;
    inset: 84px 0 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 37px 24px 0; /* the drawing's top sits where the mock-up has it */
    text-align: center;
  }
  .ctl { width: min(720px, 100%, calc((100vh - 385px) * 720 / 490)); margin-bottom: var(--s-8); }
  h1 { font-size: 28px; font-weight: var(--fw-bold); letter-spacing: -0.01em; }
  .body { margin: var(--s-3) 0 var(--s-6); color: var(--c-mute); font-size: var(--fs-lg); }
  .cmd {
    margin: calc(-1 * var(--s-3)) 0 var(--s-6); padding: var(--s-2) var(--s-4); border-radius: 10px; background: #fff;
    border: 1px solid rgba(20, 23, 28, 0.1); font: 14px ui-monospace, SFMono-Regular, Menlo, monospace; user-select: all;
  }
  .help { margin-top: 15px; color: var(--c-mute); font-size: var(--fs-sm); }
</style>
