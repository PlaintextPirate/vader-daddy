/**
 * Fuzzy-ish matching for the ⌘K palette. Case- and diacritic-insensitive; every word of the query must match
 * (AND); a word matching the start of the label beats one matching the start of a later word, which beats a
 * match anywhere. Keywords count, a little less than the label. Ties keep the index order. Pure; tested.
 */
export interface Searchable { label: string; keywords?: string[] }

export const normalise = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().trim();

/** Score of one query word against one text: 4 whole-text prefix, 3 word prefix, 1 substring, 0 none. */
function wordScore(word: string, text: string): number {
  if (text.startsWith(word)) return 4;
  if (text.split(/[\s\-_/·.,()+]+/).some((w) => w.startsWith(word))) return 3;
  return text.includes(word) ? 1 : 0;
}

/** The item's score for a query (0 = no match). An empty query matches everything with score 1. */
export function score(item: Searchable, query: string): number {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const label = normalise(item.label);
  const keys = (item.keywords ?? []).map(normalise);
  let total = 0;
  for (const w of words) {
    const best = Math.max(wordScore(w, label) * 2, ...keys.map((k) => wordScore(w, k) * 2 - 1));
    if (best <= 0) return 0;
    total += best;
  }
  // An exact label match goes first.
  return label === words.join(' ') ? total + 100 : total;
}

/** Matching items, best first; equal scores keep their original order. */
export function search<T extends Searchable>(items: readonly T[], query: string, limit = 50): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(item, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.item);
}
