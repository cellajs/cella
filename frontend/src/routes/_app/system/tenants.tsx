import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import i18n from 'i18next';
import { tenantsRouteSearchParamsSchema, tenantsSearchDefaults } from '~/modules/tenants/search-params-schemas';
import { withSuspense } from '~/routes/-route-utils';
import { pageHead } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const TenantsTable = lazyNamed(() => import('~/modules/tenants/table/tenants-table'), 'TenantsTable');

export const Route = createFileRoute('/_app/system/tenants')({
  validateSearch: tenantsRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(tenantsSearchDefaults)] },
  staticData: { isAuth: true, navTab: { id: 'tenants', label: 'c:tenant_other', description: 'c:tab_tenants.text' } },
  head: () => pageHead(i18n.t('c:tenant_other')),
  component: withSuspense(TenantsTable),
});
