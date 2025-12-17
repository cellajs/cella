// queryCacheSelector.ts
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { isInfiniteQueryData, isQueryData } from '~/query/utils/mutate-query';

export function useQueryCacheSelector<T>(selector: (qc: QueryClient) => T, deps: readonly unknown[] = []): T {
  const qc = useQueryClient();

  const getSnapshot = useCallback(() => selector(qc), [qc, ...deps]);

  return useSyncExternalStore((onStoreChange) => qc.getQueryCache().subscribe(onStoreChange), getSnapshot, getSnapshot);
}

export type WithIdSlug = { id?: string | null; slug?: string | null };

export function flattenCachedToArray<T>(cachedData: unknown): T[] {
  if (!cachedData) return [];

  // 1) { items: T[] }
  if (isQueryData<T>(cachedData)) return cachedData.items ?? [];

  // 2) Infinite: { pages: [{ items: T[] }, ...] }
  if (isInfiniteQueryData<T>(cachedData)) {
    return cachedData.pages.flatMap((p: any) => p.items ?? []);
  }

  // 3) Raw array
  if (Array.isArray(cachedData)) return cachedData as T[];

  // 4) “menu object”: { organization: T[], workspace: T[], ... } or any object containing arrays/entities
  if (typeof cachedData === 'object') {
    const out: T[] = [];
    for (const v of Object.values(cachedData as Record<string, unknown>)) {
      if (Array.isArray(v)) out.push(...(v as T[]));
      else if (v && typeof v === 'object') out.push(v as T);
    }
    return out;
  }

  return [];
}
