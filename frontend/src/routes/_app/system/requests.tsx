import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import i18n from 'i18next';
import { withSuspense } from '~/modules/common/with-suspense';
import { requestsRouteSearchParamsSchema, requestsSearchDefaults } from '~/modules/requests/search-params-schemas';
import { RequestsTable } from '~/modules/requests/table/requests-table';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/system/requests')({
  staticData: { navTab: { id: 'requests', label: 'c:request_other', description: 'c:tab_requests.text' } },
  validateSearch: requestsRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(requestsSearchDefaults)] },
  head: () => pageHead(i18n.t('c:request_other')),
  component: withSuspense(RequestsTable),
});
