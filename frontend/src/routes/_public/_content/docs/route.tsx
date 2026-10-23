import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { operationsQueryOptions, prefetchTagDetails, schemasQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import { queryClient } from '~/query/query-client';
import { createErrorComponent, createNotFoundComponent, withSuspense } from '~/routes/-route-utils';
import { pageHead } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const DocsLayout = lazyNamed(() => import('~/modules/docs/docs-layout'), 'DocsLayout');

export const Route = createFileRoute('/_public/_content/docs')({
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:docs')),
  errorComponent: createErrorComponent('public', '/docs'),
  notFoundComponent: createNotFoundComponent('public', '/docs'),
  loader: async () => {
    // Prefetch tags and schemas (used for error response deduplication)
    const [tags] = await Promise.all([queryClient.query(tagsQueryOptions), queryClient.query(schemasQueryOptions)]);
    // Eagerly prefetch tag details so child routes don't waterfall (skip empty tags)
    for (const tag of tags) {
      if (tag.count > 0) prefetchTagDetails(tag.name);
    }
    // Prefetching operations also lets the service worker cache them for offline search.
    void queryClient.query(operationsQueryOptions).catch(() => {});
  },
  component: withSuspense(DocsLayout),
});
