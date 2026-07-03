import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';
import { organizationsRouteSearchParamsSchema } from '~/modules/organization/search-params-schemas';
import { withSuspense } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';

const OrganizationsTable = lazy(() => import('~/modules/organization/table/organizations-table'));

/**
 * System organizations table for managing all organizations.
 */
export const Route = createFileRoute('/_app/system/organizations')({
  validateSearch: organizationsRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'organizations', label: 'c:organization_other' } },
  head: () => ({ meta: [{ title: appTitle('Organizations') }] }),
  component: withSuspense(OrganizationsTable),
});
