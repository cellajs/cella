import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';
import { tenantsRouteSearchParamsSchema } from '~/modules/tenants/search-params-schemas';
import { withSuspense } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';

const TenantsTable = lazy(() => import('~/modules/tenants/table/tenants-table'));

/**
 * System tenants table for managing multi-tenant isolation.
 */
export const Route = createFileRoute('/_app/system/tenants')({
  validateSearch: tenantsRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'tenants', label: 'c:tenants' } },
  head: () => ({ meta: [{ title: appTitle('Tenants') }] }),
  component: withSuspense(TenantsTable),
});
