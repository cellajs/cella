import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { tenantsRouteSearchParamsSchemas, tenantsSearchDefaults } from '~/modules/tenants/search-params-schemas';
import { withSuspense } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const TenantsTable = lazyNamed(() => import('~/modules/tenants/table/tenants-table'), 'TenantsTable');

export const Route = createFileRoute('/_app/system/tenants')({
  validateSearch: tenantsRouteSearchParamsSchemas,
  search: { middlewares: [stripSearchParams(tenantsSearchDefaults)] },
  staticData: { isAuth: true, navTab: { id: 'tenants', label: 'c:tenant_other', description: 'c:tab_tenants.text' } },
  head: () => ({ meta: [{ title: appTitle('Tenants') }] }),
  component: withSuspense(TenantsTable),
});
