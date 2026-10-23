import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { infoQueryOptions, openApiSpecQueryOptions } from '~/modules/docs/query';
import { queryClient } from '~/query/query-client';
import { withSuspense } from '~/routes/-route-utils';
import { pageHead } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const OverviewPage = lazyNamed(() => import('~/modules/docs/overview-page'), 'OverviewPage');

export const Route = createFileRoute('/_public/_content/docs/overview')({
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:api_overview')),
  loader: async () => {
    await Promise.all([queryClient.query(infoQueryOptions), queryClient.query(openApiSpecQueryOptions)]);
  },
  component: withSuspense(OverviewPage),
});
