import type { QueryData } from '~/query/types';

/** One page read as `fetchAllPages` asks for it: from the start, from a `skip`, or by a page token. */
export type PageRequest = { maxPageSize: number; skip?: number; pageToken?: string };

type PageFetcher<T> = (page: PageRequest) => Promise<QueryData<T>>;

/**
 * Reads every page of a list. The pages the first page's `totalSize` promises run concurrently, each from its `skip`, and
 * a last page that still names a next page reads on by its token, so a total that trails the list truncates nothing.
 * The skips step by what the first page held: a list caps `maxPageSize` at its own largest page, and every page before
 * the last is full.
 */
export async function fetchAllPages<T>(fetchPage: PageFetcher<T>, maxPageSize: number): Promise<QueryData<T>> {
  const first = await fetchPage({ maxPageSize });
  const pageSize = first.results.length;
  const remaining = first.nextPageToken && pageSize > 0 ? Math.ceil((first.totalSize - pageSize) / pageSize) : 0;
  const skips = Array.from({ length: remaining }, (_, index) => (index + 1) * pageSize);
  const pages = [first, ...(await Promise.all(skips.map((skip) => fetchPage({ maxPageSize, skip }))))];

  let last = pages[pages.length - 1];
  while (last.nextPageToken) {
    last = await fetchPage({ maxPageSize, pageToken: last.nextPageToken });
    pages.push(last);
  }

  return { results: pages.flatMap((page) => page.results), totalSize: first.totalSize };
}
