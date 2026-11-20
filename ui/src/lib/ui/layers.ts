// One stack of open layers (palette, sheet, popovers, menus). Only the top-most layer answers Esc and pointer
// presses outside it, so Esc always closes the layer the user sees on top: palette → sheet → popover/menu. Panels
// and views are not layers: when the stack is empty the app's own Esc handler (session.close) runs. Pure logic plus
// one lazily installed pair of document listeners; tested in layers.test.ts.

export interface LayerSpec {
  /** Esc while this layer is on top. */
  escape?: () => void;
  /** True when a pointer press on `target` belongs to this layer (its card, its anchor). */
  inside?: (target: Node) => boolean;
  /** A pointer press outside the layer while it is on top. */
  outside?: () => void;
}

interface Layer extends LayerSpec { id: number }

const stack: Layer[] = [];
let next = 1;
let installed = false;

/** Opens a layer on top of the others. Returns the function that removes it (safe to call twice). */
export function pushLayer(spec: LayerSpec): () => void {
  const layer: Layer = { ...spec, id: next++ };
  stack.push(layer);
  install();
  return () => {
    const i = stack.findIndex((l) => l.id === layer.id);
    if (i >= 0) stack.splice(i, 1);
  };
}

export const layerCount = (): number => stack.length;

/** Esc: the top-most layer closes. True when a layer handled it. */
export function escapeTop(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.escape?.();
  return true;
}

/** A pointer press: only the top-most layer may close for it, and only when the press is outside it. */
export function pointerDown(target: Node): void {
  const top = stack[stack.length - 1];
  if (!top || !top.outside) return;
  if (top.inside?.(target)) return;
  top.outside();
}

function install() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  // Bubble phase on document: a control that handles Esc itself (an exact-value field) stops it first.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (escapeTop()) { e.preventDefault(); e.stopPropagation(); }
  });
  document.addEventListener('pointerdown', (e) => pointerDown(e.target as Node), true);
}
