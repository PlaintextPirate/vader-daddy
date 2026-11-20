import { getContext } from 'svelte';
import type { InputBus, InputState } from '$lib/device/input';

/** Context key under which the shell (routes/+page.svelte) provides its one input bus. */
export const INPUT_BUS = 'vader.inputBus';

const OFF: InputState = { connected: false };
/** Used when no bus is provided: no live input, and no second stream to the service. */
const inert: Pick<InputBus, 'subscribe' | 'latest'> = { subscribe: (fn) => { fn(OFF); return () => {}; }, latest: () => OFF };

/** The shell's input bus. Call during component initialisation. */
export function useBus(): Pick<InputBus, 'subscribe' | 'latest'> {
  return getContext<InputBus | undefined>(INPUT_BUS) ?? inert;
}
