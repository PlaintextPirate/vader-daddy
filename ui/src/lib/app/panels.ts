import type { Component } from 'svelte';
import { PARTS, isPartId } from '$lib/controller/parts';
import type { Selection } from '$lib/stores/session.svelte';

/** Props every panel takes. Panels read and write the stores directly. */
export interface PanelProps { part?: import('$lib/controller/parts').PartId; side?: 'left' | 'right' }
type Loader = () => Promise<{ default: Component<PanelProps> }>;

// Each panel is its own chunk, loaded the first time it is opened.
const LOAD = {
  button: () => import('$lib/panels/ButtonPanel.svelte'),
  stick: () => import('$lib/panels/StickPanel.svelte'),
  trigger: () => import('$lib/panels/TriggerPanel.svelte'),
  light: () => import('$lib/panels/LightPanel.svelte'),
  gyro: () => import('$lib/panels/GyroPanel.svelte'),
  vibration: () => import('$lib/panels/VibrationPanel.svelte')
} satisfies Record<string, Loader>;

/** Which panel a selection opens, with its props; null when the part has no panel (Home, Capture). */
export function panelFor(s: Selection): { key: string; load: Loader; props: PanelProps } | null {
  if (s === 'gyro' || s === 'vibration') return { key: s, load: LOAD[s], props: {} };
  if (!isPartId(s)) return null;
  const kind = PARTS[s].inspector;
  if (kind === 'none') return null;
  const side = s === 'ls' || s === 'lt' ? 'left' : s === 'rs' || s === 'rt' ? 'right' : undefined;
  return { key: s, load: LOAD[kind], props: { part: s, side } };
}
