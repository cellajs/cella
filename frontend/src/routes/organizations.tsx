import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { getMembersQuerySchema } from 'backend/modules/general/schema';
import { lazy, Suspense } from 'react';
import { queryClient } from '~/lib/router';
import { noDirectAccess } from '~/lib/utils';
import ErrorNotice from '~/modules/common/error-notice';
import Organization, { organizationQueryOptions } from '~/modules/organizations/organization';
import OrganizationSettings from '~/modules/organizations/organization-settings';
import { IndexRoute } from './routeTree';
import { membersQueryOptions } from '~/modules/organizations/members-table';

//Lazy-loaded components
const MembersTable = lazy(() => import('~/modules/organizations/members-table'));

// Search query schema
const membersSearchSchema = getMembersQuerySchema.pick({ q: true, sort: true, order: true, role: true });

export const OrganizationRoute = createRoute({
  path: '$idOrSlug',
  staticData: { pageTitle: 'Organization' },
  beforeLoad: ({ location, params }) => noDirectAccess(location.pathname, params.idOrSlug, '/members'),
  getParentRoute: () => IndexRoute,
  loader: async ({ params: { idOrSlug } }) => await queryClient.ensureQueryData(organizationQueryOptions(idOrSlug)),
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => (
    <Suspense>
      <Organization />
    </Suspense>
  ),
});

export const OrganizationMembersRoute = createRoute({
  path: '/members',
  validateSearch: membersSearchSchema,
  staticData: { pageTitle: 'Members' },
  getParentRoute: () => OrganizationRoute,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  loader: async ({ params: { idOrSlug }, deps: { q, sort, order, role } }) => {
    const entityType = 'ORGANIZATION';
    const membersInfiniteQueryOptions = membersQueryOptions({ idOrSlug, entityType, q, sort, order, role });
    const cachedMembers = queryClient.getQueryData(membersInfiniteQueryOptions.queryKey);
    if (!cachedMembers) {
      queryClient.fetchInfiniteQuery(membersInfiniteQueryOptions);
    }
  },
  component: () => (
    <Suspense>
      <MembersTable entityType="ORGANIZATION" />
    </Suspense>
  ),
});

export const OrganizationSettingsRoute = createRoute({
  path: '/settings',
  staticData: { pageTitle: 'Settings' },
  getParentRoute: () => OrganizationRoute,
  component: () => <OrganizationSettings />,
});
