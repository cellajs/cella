import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';
import { requestsRouteSearchParamsSchema } from '~/modules/requests/search-params-schemas';
import { withSuspense } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';

const RequestsTable = lazy(() => import('~/modules/requests/table/requests-table'));

/**
 * System requests table for reviewing access requests.
 */
export const Route = createFileRoute('/_app/system/requests')({
  validateSearch: requestsRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'requests', label: 'c:request_other' } },
  head: () => ({ meta: [{ title: appTitle('Requests') }] }),
  component: withSuspense(RequestsTable),
});
