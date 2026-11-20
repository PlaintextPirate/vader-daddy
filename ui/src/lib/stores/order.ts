/**
 * Remembers which unsaved change was edited last, across the profile and lighting stores, so ⌘Z undoes the field
 * the user touched most recently (not the one first changed). Non-reactive; the stores call `sync` whenever their
 * change list is recomputed, with each change's id and its current value: a new value counts as a fresh edit.
 * Pure; tested.
 */
export interface Edited { id: string; value: string }

export function createChangeOrder() {
  /** "scope:id" → the value last seen, oldest edit first (Map keeps insertion order). */
  const order = new Map<string, string>();
  return {
    sync(scope: string, items: Edited[]) {
      const now = new Map(items.map((c) => [`${scope}:${c.id}`, c.value]));
      for (const k of [...order.keys()]) if (k.startsWith(`${scope}:`) && !now.has(k)) order.delete(k);
      for (const [k, v] of now) {
        if (order.get(k) === v) continue;
        order.delete(k); // edited again (or new): it becomes the latest
        order.set(k, v);
      }
    },
    /** The most recently edited change still pending, or null. */
    latest(): { scope: string; id: string } | null {
      const k = [...order.keys()].pop();
      if (!k) return null;
      const i = k.indexOf(':');
      return { scope: k.slice(0, i), id: k.slice(i + 1) };
    }
  };
}

export const changeOrder = createChangeOrder();
