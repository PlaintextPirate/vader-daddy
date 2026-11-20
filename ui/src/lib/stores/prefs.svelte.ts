import { storage } from './storage';

const DOCK_KEY = 'vaderdaddy.dockAnimated';

/** Preferences of the app itself (not the controller), remembered on this Mac. */
class Prefs {
  /** True inside the Mac app, which can redraw its Dock icon (app/main.swift); false in a browser. */
  readonly hasDock = !!(globalThis as any).webkit?.messageHandlers?.vaderIcon;
  #dockAnimated = $state(storage.get(DOCK_KEY) !== '0');
  /** The Dock icon runs through an animated profile's colours; off shows its first step, still. */
  get dockAnimated() { return this.#dockAnimated; }
  set dockAnimated(on: boolean) { this.#dockAnimated = on; storage.set(DOCK_KEY, on ? '1' : '0'); }
}

export const prefs = new Prefs();
