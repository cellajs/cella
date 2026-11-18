import {
  infoQueryOptions,
  openApiSpecQueryOptions,
  operationsQueryOptions,
  prefetchTagDetails,
  schemasQueryOptions,
  schemaTagsQueryOptions,
  tagsQueryOptions,
} from '~/modules/docs/query';
import { queryClient } from '~/query/query-client';

/**
 * `loader` of the docs layout: the tags and the schemas (error responses dedupe on them), then each tag's details so no
 * page below waterfalls. The operations and the API info load in the background: every operation's access line reads
 * the info, and the operations let the service worker cache them for offline search.
 */
export async function docsLayoutLoader(): Promise<void> {
  const [tags] = await Promise.all([queryClient.query(tagsQueryOptions), queryClient.query(schemasQueryOptions)]);
  for (const tag of tags) {
    if (tag.count > 0) prefetchTagDetails(tag.name);
  }
  void queryClient.query(operationsQueryOptions).catch(() => {});
  void queryClient.query(infoQueryOptions).catch(() => {});
}

/** `loader` of the operations list and the operations table. */
export async function operationsLoader(): Promise<void> {
  await queryClient.query(operationsQueryOptions);
}

/** `loader` of the schemas page. */
export async function schemasLoader(): Promise<void> {
  await Promise.all([queryClient.query(schemasQueryOptions), queryClient.query(schemaTagsQueryOptions)]);
}

/** `loader` of the overview page. */
export async function overviewLoader(): Promise<void> {
  await Promise.all([queryClient.query(infoQueryOptions), queryClient.query(openApiSpecQueryOptions)]);
}
