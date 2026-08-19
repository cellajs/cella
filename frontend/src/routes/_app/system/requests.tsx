import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { requestsRouteSearchParamsSchema, requestsSearchDefaults } from '~/modules/requests/search-params-schemas';
import { withSuspense } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const RequestsTable = lazyNamed(() => import('~/modules/requests/table/requests-table'), 'RequestsTable');

export const Route = createFileRoute('/_app/system/requests')({
  validateSearch: requestsRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(requestsSearchDefaults)] },
  staticData: {
    isAuth: true,
    navTab: { id: 'requests', label: 'c:request_other', description: 'c:tab_requests.text' },
  },
  head: () => ({ meta: [{ title: appTitle('Requests') }] }),
  component: withSuspense(RequestsTable),
});
