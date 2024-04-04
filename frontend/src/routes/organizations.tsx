import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { getUsersByOrganizationQuerySchema } from 'backend/modules/organizations/schema';
import { Suspense, lazy } from 'react';
import { noDirectAccess } from '~/lib/utils';
import ErrorNotice from '~/modules/common/error-notice';
import { membersQueryOptions } from '~/modules/organizations/members-table';
import Organization, { organizationQueryOptions } from '~/modules/organizations/organization';
import OrganizationSettings from '~/modules/organizations/organization-settings';
import Projects from '~/modules/projects';
import { IndexRoute } from './routeTree';

// Lazy-loaded components
const MembersTable = lazy(() => import('~/modules/organizations/members-table'));

const membersSearchSchema = getUsersByOrganizationQuerySchema.pick({ q: true, sort: true, order: true, role: true });

export const OrganizationRoute = createRoute({
  path: '$organizationIdentifier',
  staticData: { pageTitle: 'Organization' },
  beforeLoad: ({ location }) => noDirectAccess(location, '/members'),
  getParentRoute: () => IndexRoute,
  loader: async ({ context: { queryClient }, params: { organizationIdentifier } }) => {
    queryClient.ensureQueryData(organizationQueryOptions(organizationIdentifier));
  },
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => (
    <Suspense>
      <Organization />
    </Suspense>
  ),
});

export const organizationMembersRoute = createRoute({
  path: '/members',
  staticData: { pageTitle: 'Members' },
  getParentRoute: () => OrganizationRoute,
  validateSearch: membersSearchSchema,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  loader: async ({ context: { queryClient }, params: { organizationIdentifier }, deps: { q, sort, order, role } }) => {
    const membersInfiniteQueryOptions = membersQueryOptions(organizationIdentifier, { q, sort, order, role });
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

// INFO: This is a proof of concept development
export const projectsRoute = createRoute({
  path: '/projects',
  staticData: { pageTitle: 'Projects' },
  getParentRoute: () => OrganizationRoute,
  component: () => <Projects />,
});

export const organizationSettingsRoute = createRoute({
  path: '/settings',
  staticData: { pageTitle: 'Settings' },
  getParentRoute: () => OrganizationRoute,
  component: () => <OrganizationSettings />,
});
