import { createFileRoute } from '@tanstack/react-router';
import { infoQueryOptions, openApiSpecQueryOptions } from '~/modules/docs/query';
import { queryClient } from '~/query/query-client';
import { withSuspense } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const OverviewPage = lazyNamed(() => import('~/modules/docs/overview-page'), 'OverviewPage');

export const Route = createFileRoute('/_public/_content/docs/overview')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('API overview') }] }),
  loader: async () => {
    await Promise.all([
      queryClient.ensureQueryData(infoQueryOptions),
      queryClient.ensureQueryData(openApiSpecQueryOptions),
    ]);
  },
  component: withSuspense(OverviewPage),
});
