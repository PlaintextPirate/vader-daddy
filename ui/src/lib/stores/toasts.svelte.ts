/** Toast messages. ok/info leave by themselves after 3.5 s (12 s with an action); errors stay until dismissed. At most 3 visible. */
export type ToastKind = 'ok' | 'error' | 'info';
export interface ToastAction { label: string; run: () => void }
export interface Toast { id: string; kind: ToastKind; text: string; action?: ToastAction }

const AUTO_MS = 3500;
/** A toast with an action stays longer, so there is time to use it. */
const ACTION_MS = 12000;
const MAX_VISIBLE = 3;

class Toasts {
  items = $state<Toast[]>([]);
  private next = 1; // ids are strings for the Toasts primitive
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  private push(kind: ToastKind, text: string, action?: ToastAction): string {
    // The same message twice in a row (e.g. a retry failing again) is shown once.
    const same = this.items.find((t) => t.kind === kind && t.text === text);
    if (same) this.dismiss(same.id);
    const id = String(this.next++);
    this.items = [...this.items, { id, kind, text, action }].slice(-MAX_VISIBLE);
    if (kind !== 'error') this.timers.set(id, setTimeout(() => this.dismiss(id), action ? ACTION_MS : AUTO_MS));
    return id;
  }

  ok = (text: string) => this.push('ok', text);
  error = (text: string) => this.push('error', text);
  info = (text: string, action?: ToastAction) => this.push('info', text, action);

  /** Dismisses every toast `match` picks (e.g. connection errors once the connection is back). */
  dismissWhere = (match: (t: Toast) => boolean) => {
    for (const t of this.items.filter(match)) this.dismiss(t.id);
  };

  dismiss = (id: string) => {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.items = this.items.filter((t) => t.id !== id);
  };
}

export const toasts = new Toasts();
