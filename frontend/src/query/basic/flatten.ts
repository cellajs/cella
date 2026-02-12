/**
 * Flatten query data - handles both infinite queries and regular queries.
 * Accepts InfiniteData ({ pages }), standard list data ({ items }), or undefined.
 */
// biome-ignore lint/suspicious/noExplicitAny: accepts heterogeneous query data shapes without requiring callers to cast
export function flattenInfiniteData<T>(data: any): T[] {
  if (!data) return [];

  // Handle InfiniteQuery data: { pages: [...] }
  if ('pages' in data) {
    return data.pages.flatMap((p: any) => p.items);
  }

  return data.items;
}
