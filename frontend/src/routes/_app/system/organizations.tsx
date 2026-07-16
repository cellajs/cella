import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import {
  organizationsRouteSearchParamsSchema,
  organizationsSearchDefaults,
} from '~/modules/organization/search-params-schemas';
import { withSuspense } from '~/routes/_route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const OrganizationsTable = lazyNamed(
  () => import('~/modules/organization/table/organizations-table'),
  'OrganizationsTable',
);

/**
 * System organizations table for managing all organizations.
 */
export const Route = createFileRoute('/_app/system/organizations')({
  validateSearch: organizationsRouteSearchParamsSchema,
  // Absence means default: params equal to the default view are stripped from the URL
  search: { middlewares: [stripSearchParams(organizationsSearchDefaults)] },
  staticData: { isAuth: true, navTab: { id: 'organizations', label: 'c:organization_other' } },
  head: () => ({ meta: [{ title: appTitle('Organizations') }] }),
  component: withSuspense(OrganizationsTable),
});
