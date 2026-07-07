import { createFileRoute } from '@tanstack/react-router';
import { infoQueryOptions, openApiSpecQueryOptions } from '~/modules/docs/query';
import { queryClient } from '~/query/query-client';
import { withSuspense } from '~/routes/route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const OverviewPage = lazyNamed(() => import('~/modules/docs/overview-page'), 'OverviewPage');

/**
 * Overview route - shows OpenAPI info in a table format and spec in JSON viewer.
 */
export const Route = createFileRoute('/_public/_content/docs/overview')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('API overview') }] }),
  loader: async () => {
    // Prefetch info and OpenAPI spec used by OverviewTable and OpenApiSpecViewer
    await Promise.all([
      queryClient.ensureQueryData(infoQueryOptions),
      queryClient.ensureQueryData(openApiSpecQueryOptions),
    ]);
  },
  component: withSuspense(OverviewPage),
});
