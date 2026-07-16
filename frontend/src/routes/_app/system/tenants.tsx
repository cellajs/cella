import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { tenantsRouteSearchParamsSchemas, tenantsSearchDefaults } from '~/modules/tenants/search-params-schemas';
import { withSuspense } from '~/routes/_route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const TenantsTable = lazyNamed(() => import('~/modules/tenants/table/tenants-table'), 'TenantsTable');

/**
 * System tenants table for managing multi-tenant isolation.
 */
export const Route = createFileRoute('/_app/system/tenants')({
  validateSearch: tenantsRouteSearchParamsSchemas,
  // Absence means default: params equal to the default view are stripped from the URL
  search: { middlewares: [stripSearchParams(tenantsSearchDefaults)] },
  staticData: { isAuth: true, navTab: { id: 'tenants', label: 'c:tenant_other' } },
  head: () => ({ meta: [{ title: appTitle('Tenants') }] }),
  component: withSuspense(TenantsTable),
});
