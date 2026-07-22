const MAX_RECENT_SEARCHES = 5;

/** Comparison form: lowercased, whitespace and special characters stripped. */
const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Add a normalized recent query, keeping the most detailed containment variant first.
 * Return the original array reference when nothing changes.
 */
export function addRecentSearch(searches: string[], value: string): string[] {
  const trimmed = value.trim();
  const normalized = normalize(trimmed);
  if (normalized.length < 3) return searches;

  // The survivor for this normalized family: the most detailed variant wins,
  // ties keep the fresh input (latest casing/phrasing).
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

  return [keep, ...rest].slice(0, MAX_RECENT_SEARCHES);
}
