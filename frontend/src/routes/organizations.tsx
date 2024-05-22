import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { getRequestsQuerySchema } from 'backend/modules/general/schema';
import { getUsersByOrganizationQuerySchema } from 'backend/modules/organizations/schema';
import { Suspense, lazy } from 'react';
import { queryClient } from '~/lib/router';
import { noDirectAccess } from '~/lib/utils';
import ErrorNotice from '~/modules/common/error-notice';
import { membersQueryOptions } from '~/modules/organizations/members-table';
import Organization, { organizationQueryOptions } from '~/modules/organizations/organization';
import OrganizationSettings from '~/modules/organizations/organization-settings';
import { IndexRoute } from './routeTree';

// Lazy-loaded components
const MembersTable = lazy(() => import('~/modules/organizations/members-table'));
const RequestsTable = lazy(() => import('~/modules/system/requests-table'));

const membersSearchSchema = getUsersByOrganizationQuerySchema.pick({ q: true, sort: true, order: true, role: true });
const requestSearchSchema = getRequestsQuerySchema.pick({ q: true, sort: true, order: true });

export const OrganizationRoute = createRoute({
  path: '$idOrSlug',
  staticData: { pageTitle: 'Organization' },
  beforeLoad: ({ location, params }) => noDirectAccess(location.pathname, params.idOrSlug, '/members'),
  getParentRoute: () => IndexRoute,
  loader: async ({ params: { idOrSlug } }) => {
    queryClient.ensureQueryData(organizationQueryOptions(idOrSlug));
  },
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => (
    <Suspense>
      <Organization />
    </Suspense>
  ),
});

export const OrganizationMembersRoute = createRoute({
  path: '/members',
  staticData: { pageTitle: 'Members' },
  getParentRoute: () => OrganizationRoute,
  validateSearch: membersSearchSchema,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  loader: async ({ params: { idOrSlug }, deps: { q, sort, order, role } }) => {
    const membersInfiniteQueryOptions = membersQueryOptions(idOrSlug, { q, sort, order, role });
    const cachedMembers = queryClient.getQueryData(membersInfiniteQueryOptions.queryKey);
    if (!cachedMembers) {
      queryClient.fetchInfiniteQuery(membersInfiniteQueryOptions);
    }
  },
  component: () => (
    <Suspense>
      <MembersTable />
    </Suspense>
  ),
});

export const OrganizationSettingsRoute = createRoute({
  path: '/settings',
  staticData: { pageTitle: 'Settings' },
  getParentRoute: () => OrganizationRoute,
  component: () => <OrganizationSettings />,
});

export const OrganizationRequestsRoute = createRoute({
  path: '/requests',
  staticData: { pageTitle: 'Requests' },
  getParentRoute: () => OrganizationRoute,
  component: () => (
    <Suspense>
      <RequestsTable mode="organization" />
    </Suspense>
  ),
  validateSearch: requestSearchSchema,
});
