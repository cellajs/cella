const MAX_RECENT_SEARCHES = 5;

/** Comparison form: lowercased, whitespace and special characters stripped. */
const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Add a query to a recent-searches list (used by app search and docs search).
 * Most recent first; entries deduped by normalized form; containment-deduped so
 * only the most detailed variant survives — searching "user" after
 * "user roles" keeps "user roles" (bumped to the top), while searching
 * "user roles" after "user" replaces it.
 *
 * Returns the input array unchanged (same reference) when nothing was added.
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
