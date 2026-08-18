import type { QueryData } from '~/query/types';

type PaginatedFetcher<T> = (params: { limit: string; offset: string }) => Promise<QueryData<T>>;

/** Fetch all pages of a paginated `{ items, total }` endpoint; pages after the first run concurrently. */
export async function fetchAllPages<T>(fetcher: PaginatedFetcher<T>, limit: number): Promise<QueryData<T>> {
  const first = await fetcher({ limit: String(limit), offset: '0' });

  if (first.items.length >= first.total) return first;

  const remaining = Math.ceil((first.total - first.items.length) / limit);

  const pages = await Promise.all(
    Array.from({ length: remaining }, (_, i) => fetcher({ limit: String(limit), offset: String((i + 1) * limit) })),
  );

  return {
    items: [first, ...pages].flatMap((p) => p.items),
    total: first.total,
  };
}
