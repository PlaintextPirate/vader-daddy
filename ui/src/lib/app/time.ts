/** Small date and list formatting for the History view. Pure; tested. */
import { copy } from '../copy.ts';

const rtf = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35], ['month', 12], ['year', Infinity]
];

/** "just now", "5 minutes ago", "yesterday", "3 weeks ago". */
export function relativeTime(iso: string, now = Date.now()): string {
  let v = (Date.parse(iso) - now) / 1000;
  if (Math.abs(v) < 45) return copy.history.justNow;
  for (const [unit, size] of STEPS) {
    if (Math.abs(v) < size) return rtf.format(Math.round(v), unit);
    v /= size;
  }
  return rtf.format(Math.round(v), 'year');
}

/** Slot keys (0-based) as the 1-based list people read: "1, 2, 4", or "—" when empty. */
export function slotList(m: Record<number, unknown>): string {
  const keys = Object.keys(m).map(Number).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  return keys.length ? keys.map((k) => k + 1).join(', ') : copy.common.none;
}
