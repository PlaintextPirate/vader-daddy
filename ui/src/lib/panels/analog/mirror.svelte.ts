/**
 * "Same for the other stick/trigger" switches: UI state for this session only. Until the user flips one, it
 * follows whether both sides are identical right now.
 */
const chosen = $state<{ stick?: boolean; trigger?: boolean }>({});

export const mirror = {
  on: (kind: 'stick' | 'trigger', identical: boolean) => chosen[kind] ?? identical,
  set: (kind: 'stick' | 'trigger', v: boolean) => { chosen[kind] = v; }
};
