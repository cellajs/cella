import { createFileRoute } from '@tanstack/react-router';
import {
  operationsQueryOptions,
  schemasQueryOptions,
  tagDetailsQueryOptions,
  tagsQueryOptions,
} from '~/modules/docs/query';
import { queryClient } from '~/query/query-client';
import { createErrorComponent, createNotFoundComponent, withSuspense } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const DocsLayout = lazyNamed(() => import('~/modules/docs/docs-layout'), 'DocsLayout');

/**
 * Documentation layout route for API reference and developer guides.
 */
export const Route = createFileRoute('/_public/_content/docs')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Docs') }] }),
  errorComponent: createErrorComponent('public', '/docs'),
  notFoundComponent: createNotFoundComponent('public', '/docs'),
  loader: async () => {
    // Prefetch tags and schemas (used for error response deduplication)
    const [tags] = await Promise.all([
      queryClient.ensureQueryData(tagsQueryOptions),
      queryClient.ensureQueryData(schemasQueryOptions),
    ]);
    // Eagerly prefetch tag details so child routes don't waterfall (skip empty tags)
    for (const tag of tags) {
      if (tag.count > 0) queryClient.prefetchQuery(tagDetailsQueryOptions(tag.name));
    }
    // Operations feed the sidebar sections and the docs search corpus; prefetching
    // here also lets the service worker cache them for offline search.
    queryClient.prefetchQuery(operationsQueryOptions);
  },
  component: withSuspense(DocsLayout),
});
