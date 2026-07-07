import { createFileRoute } from '@tanstack/react-router';
import { requestsRouteSearchParamsSchema } from '~/modules/requests/search-params-schemas';
import { withSuspense } from '~/routes/route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const RequestsTable = lazyNamed(() => import('~/modules/requests/table/requests-table'), 'RequestsTable');

/**
 * System requests table for reviewing access requests.
 */
export const Route = createFileRoute('/_app/system/requests')({
  validateSearch: requestsRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'requests', label: 'c:request_other' } },
  head: () => ({ meta: [{ title: appTitle('Requests') }] }),
  component: withSuspense(RequestsTable),
});
