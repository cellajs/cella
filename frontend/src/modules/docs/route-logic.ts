import { operationsQueryOptions, prefetchTagDetails, schemasQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import { queryClient } from '~/query/query-client';

/**
 * `loader` of the docs layout: the tags and the schemas (error responses dedupe on them), then each tag's details so no
 * page below waterfalls, and the operations in the background, which also lets the service worker cache them for
 * offline search.
 */
export async function docsLayoutLoader(): Promise<void> {
  const [tags] = await Promise.all([queryClient.query(tagsQueryOptions), queryClient.query(schemasQueryOptions)]);
  for (const tag of tags) {
    if (tag.count > 0) prefetchTagDetails(tag.name);
  }
  void queryClient.query(operationsQueryOptions).catch(() => {});
}
