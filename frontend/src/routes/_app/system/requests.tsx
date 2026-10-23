import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import i18n from 'i18next';
import { requestsRouteSearchParamsSchema, requestsSearchDefaults } from '~/modules/requests/search-params-schemas';
import { withSuspense } from '~/routes/-route-utils';
import { pageHead } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const RequestsTable = lazyNamed(() => import('~/modules/requests/table/requests-table'), 'RequestsTable');

export const Route = createFileRoute('/_app/system/requests')({
  validateSearch: requestsRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(requestsSearchDefaults)] },
  staticData: { isAuth: true, navTab: { id: 'requests', label: 'c:request_other', description: 'c:tab_requests.text' } },
  head: () => pageHead(i18n.t('c:request_other')),
  component: withSuspense(RequestsTable),
});
