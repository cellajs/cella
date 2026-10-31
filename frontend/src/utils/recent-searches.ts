const maxRecentSearches = 5;

/** Comparison form: lowercased, whitespace and special characters stripped. */
const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Adds a query, keeping the most detailed containment variant first. Returns the original array if unchanged. */
export function addRecentSearch(searches: string[], value: string): string[] {
  const trimmed = value.trim();
  const normalized = normalize(trimmed);
  if (normalized.length < 3) return searches;

  // Survivor for this normalized family: the most detailed variant wins, ties keep the fresh input.
  let keep = trimmed;
  const rest: string[] = [];
  for (const entry of searches) {
    const entryNormalized = normalize(entry);
    if (entryNormalized.includes(normalized)) {
      if (entryNormalized.length > normalize(keep).length) keep = entry;
      continue;
    }
    if (normalized.includes(entryNormalized)) continue; // new value is the more detailed variant
    rest.push(entry);
  }

  return [keep, ...rest].slice(0, maxRecentSearches);
}

/** Removes a query. Returns the original array if it holds no such entry. */
export function withoutRecentSearch(searches: string[], value: string): string[] {
  return searches.includes(value) ? searches.filter((entry) => entry !== value) : searches;
}

/** Value a search input takes: a bare history index picks that entry, but only while the input was empty (the history list is showing). */
export function resolveSearchInput(previous: string, next: string, searches: string[]): string {
  const isHistoryPick = previous === '' && /^\d+$/.test(next) && Number(next) < searches.length;
  return isHistoryPick ? searches[Number(next)] : next;
}

/** A list's search as it was made: its words and its filters by name. */
export interface RecentListSearch {
  q: string;
  filters: Record<string, string[]>;
}

/** Adds a list's search to its recent ones; a search needs a filter or a word of three characters. */
export function addRecentListSearch(searches: RecentListSearch[], search: RecentListSearch): RecentListSearch[] {
  const hasFilter = Object.values(search.filters).some((values) => values.length > 0);
  if (!hasFilter && normalize(search.q).length < 3) return searches;
  const key = JSON.stringify(search);
  return [search, ...searches.filter((other) => JSON.stringify(other) !== key)].slice(0, maxRecentSearches);
}
