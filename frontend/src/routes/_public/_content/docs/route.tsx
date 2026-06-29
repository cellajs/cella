import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';
import { schemasQueryOptions, tagDetailsQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import { pagesListQueryOptions } from '~/modules/page/query';
import { queryClient } from '~/query/query-client';
import { createErrorComponent, createNotFoundComponent, withSuspense } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';

const DocsLayout = lazy(() => import('~/modules/docs/docs-layout'));

/**
 * Documentation layout route for API reference and developer guides.
 */
export const Route = createFileRoute('/_public/_content/docs')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Docs') }] }),
  errorComponent: createErrorComponent('public', '/docs'),
  notFoundComponent: createNotFoundComponent('public', '/docs'),
  loader: async () => {
    // Prefetch tags, schemas (used for error response deduplication), and pages
    const [tags] = await Promise.all([
      queryClient.ensureQueryData(tagsQueryOptions),
      queryClient.ensureQueryData(schemasQueryOptions),
      queryClient.prefetchInfiniteQuery(pagesListQueryOptions({})),
    ]);
    // Eagerly prefetch tag details so child routes don't waterfall (skip empty tags)
    for (const tag of tags) {
      if (tag.count > 0) queryClient.prefetchQuery(tagDetailsQueryOptions(tag.name));
    }
  },
  component: withSuspense(DocsLayout),
});
