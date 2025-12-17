import { InfiniteData } from '@tanstack/react-query';

export function flattenInfiniteData<T>(data: InfiniteData<any> | undefined): T[] {
  if (!data) return [];
  return data.pages.flatMap((p: any) => (Array.isArray(p) ? p : (p.items ?? p.data ?? []))) as T[];
}
