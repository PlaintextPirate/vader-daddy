<!-- Divider: a 1 px rule in the line colour between groups of a panel or popover. `space` is the vertical margin
     above and below in px (default 12). -->
<script lang="ts">
  let { space = 12 }: { space?: number } = $props();
</script>

<hr style:margin="{space}px 0" />

<style>
  hr {
    height: 0;
    border: 0;
    border-top: 1.5px solid var(--c-line);
  }
</style>
