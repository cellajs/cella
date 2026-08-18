/** Accepts InfiniteData (`{ pages }`), standard list data (`{ items }`), or undefined. */
// biome-ignore lint/suspicious/noExplicitAny: accepts heterogeneous query data shapes without requiring callers to cast
export function flattenInfiniteData<T>(data: any): T[] {
  if (!data) return [];

  if ('pages' in data) {
    return (data.pages as Array<{ items?: T[] }>).flatMap((p) => p.items ?? []);
  }

  return data.items ?? [];
}
