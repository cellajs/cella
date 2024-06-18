import { createRoute, useParams } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { membersQuerySchema } from 'backend/modules/general/schema';
import { Suspense, lazy } from 'react';
import { queryClient } from '~/lib/router';
import { noDirectAccess } from '~/lib/utils';
import ErrorNotice from '~/modules/common/error-notice';
import { membersQueryOptions } from '~/modules/organizations/members-table';
import Organization, { organizationQueryOptions } from '~/modules/organizations/organization';
import OrganizationSettings from '~/modules/organizations/organization-settings';
import { IndexRoute } from './routeTree';

//Lazy-loaded components
const MembersTable = lazy(() => import('~/modules/organizations/members-table'));

// Search query schema
export const membersSearchSchema = membersQuerySchema.pick({ q: true, sort: true, order: true, role: true });

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
    const infiniteQueryOptions = membersQueryOptions({ idOrSlug, entityType, q, sort, order, role });
    const cachedMembers = queryClient.getQueryData(infiniteQueryOptions.queryKey);
    if (!cachedMembers) {
      queryClient.fetchInfiniteQuery(infiniteQueryOptions);
    }
  },
  component: () => {
    const { idOrSlug } = useParams({ from: OrganizationMembersRoute.id });
    return (
      <Suspense>
        <MembersTable idOrSlug={idOrSlug} route={OrganizationMembersRoute.id} entityType="ORGANIZATION" />
      </Suspense>
    );
  },
});

export const OrganizationSettingsRoute = createRoute({
  path: '/settings',
  staticData: { pageTitle: 'Settings' },
  getParentRoute: () => OrganizationRoute,
  component: () => <OrganizationSettings />,
});
