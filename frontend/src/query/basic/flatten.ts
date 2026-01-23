/**
 * Flatten query data - handles both infinite queries and regular queries
 */
export function flattenInfiniteData<T>(data: any): T[] {
  if (!data) return [];

  // Handle InfiniteQuery data: { pages: [...] }
  if (data.pages && Array.isArray(data.pages)) {
    return data.pages.flatMap((p: any) => (Array.isArray(p) ? p : (p.items ?? p.data ?? []))) as T[];
  }

  return [data] as T[];
}
