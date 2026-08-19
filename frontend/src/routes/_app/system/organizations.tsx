import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import {
  organizationsRouteSearchParamsSchema,
  organizationsSearchDefaults,
} from '~/modules/organization/search-params-schemas';
import { withSuspense } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const OrganizationsTable = lazyNamed(
  () => import('~/modules/organization/table/organizations-table'),
  'OrganizationsTable',
);

export const Route = createFileRoute('/_app/system/organizations')({
  validateSearch: organizationsRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(organizationsSearchDefaults)] },
  staticData: {
    isAuth: true,
    navTab: { id: 'organizations', label: 'c:organization_other', description: 'c:tab_organizations.text' },
  },
  head: () => ({ meta: [{ title: appTitle('Organizations') }] }),
  component: withSuspense(OrganizationsTable),
});
