import type { QueryData } from '~/query/types';

/** One page read as `fetchAllPages` asks for it: from the start, from a `skip`, or by a page token. */
export type PageRequest = { maxPageSize: number; skip?: number; pageToken?: string };

type PageFetcher<T> = (page: PageRequest) => Promise<QueryData<T>>;

/**
 * Reads every page of a list. The pages the first page's `totalSize` promises run concurrently, each from its `skip`, and
 * a last page that still names a next page reads on by its token, so a total that trails the list truncates nothing.
 */
export async function fetchAllPages<T>(fetchPage: PageFetcher<T>, maxPageSize: number): Promise<QueryData<T>> {
  const first = await fetchPage({ maxPageSize });
  const remaining = first.nextPageToken ? Math.ceil((first.totalSize - first.results.length) / maxPageSize) : 0;
  const skips = Array.from({ length: remaining }, (_, index) => first.results.length + index * maxPageSize);
  const pages = [first, ...(await Promise.all(skips.map((skip) => fetchPage({ maxPageSize, skip }))))];

  let last = pages[pages.length - 1];
  while (last.nextPageToken) {
    last = await fetchPage({ maxPageSize, pageToken: last.nextPageToken });
    pages.push(last);
  }

  return { results: pages.flatMap((page) => page.results), totalSize: first.totalSize };
}
