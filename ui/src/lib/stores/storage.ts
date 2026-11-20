/**
 * localStorage with an in-memory fallback, so a blocked or full storage never breaks the app (things are then
 * simply not remembered across launches).
 */
const memory = new Map<string, string>();

function ls(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export const storage = {
  get(key: string): string | null {
    try { const v = ls()?.getItem(key); if (v != null) return v; } catch { /* blocked */ }
    return memory.get(key) ?? null;
  },
  set(key: string, value: string) {
    memory.set(key, value);
    try { ls()?.setItem(key, value); } catch { /* full or blocked: memory keeps it for this session */ }
  },
  remove(key: string) {
    memory.delete(key);
    try { ls()?.removeItem(key); } catch { /* ignore */ }
  },
  json<T>(key: string, fallback: T): T {
    const v = storage.get(key);
    if (v == null) return fallback;
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }
};
