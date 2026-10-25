import type { QueryData } from '~/query/types';

type PaginatedFetcher<T> = (params: { limit: number; offset: number }) => Promise<QueryData<T>>;

/** Fetch all pages of a paginated `{ items, total }` endpoint; pages after the first run concurrently. */
export async function fetchAllPages<T>(fetcher: PaginatedFetcher<T>, limit: number): Promise<QueryData<T>> {
  const first = await fetcher({ limit, offset: 0 });

  if (first.items.length >= first.total) return first;

  const remaining = Math.ceil((first.total - first.items.length) / limit);

  const requests = Array.from({ length: remaining }, (_, index) => fetcher({ limit, offset: (index + 1) * limit }));
  const pages = await Promise.all(requests);

  return { items: [first, ...pages].flatMap((page) => page.items), total: first.total };
}
