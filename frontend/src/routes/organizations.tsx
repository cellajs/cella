import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { getRequestsQuerySchema } from 'backend/modules/general/schema';
import { getUsersByOrganizationQuerySchema } from 'backend/modules/organizations/schema';
import { Suspense, lazy } from 'react';
import { queryClient } from '~/lib/router';
import { noDirectAccess } from '~/lib/utils';
import ErrorNotice from '~/modules/common/error-notice';
import Organization, { organizationQueryOptions } from '~/modules/organizations/organization';
import OrganizationSettings from '~/modules/organizations/organization-settings';
import { IndexRoute } from './routeTree';
import { getOrganizationMembers, type GetMembersParams } from '~/api/organizations';
import { infiniteQueryOptions } from '@tanstack/react-query';
import type { Member } from '~/types';
import UsersTable from '~/modules/users/users-table';
import type { z } from 'zod';
import { config } from 'config';

// Lazy-loaded components

const RequestsTable = lazy(() => import('~/modules/system/requests-table'));
// const UsersTable = lazy(() => import('~/modules/users/users-table'));

const membersSearchSchema = getUsersByOrganizationQuerySchema.pick({ q: true, sort: true, order: true, role: true });
const requestSearchSchema = getRequestsQuerySchema.pick({ q: true, sort: true, order: true });

const membersQueryOptions = ({ idOrSlug, q, sort: initialSort, order: initialOrder, role, limit }: GetMembersParams & { idOrSlug: string }) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['members', idOrSlug, q, sort, order, role],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getOrganizationMembers(
        idOrSlug,
        {
          page: pageParam,
          q,
          sort,
          order,
          role,
          limit,
        },
        signal,
      );

      return fetchedData;
    },
    getNextPageParam: (_lastPage, allPages) => allPages.length,
    refetchOnWindowFocus: false,
  });
};

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
    const membersInfiniteQueryOptions = membersQueryOptions({ idOrSlug, q, sort, order, role });
    const cachedMembers = queryClient.getQueryData(membersInfiniteQueryOptions.queryKey);
    if (!cachedMembers) {
      queryClient.fetchInfiniteQuery(membersInfiniteQueryOptions);
    }
  },
  component: () => (
    <Suspense>
      <UsersTable<Member, GetMembersParams & { idOrSlug: string }, z.infer<typeof getUsersByOrganizationQuerySchema>>
        queryOptions={membersQueryOptions}
        routeFrom={OrganizationMembersRoute.id}
        selectRoleOptions={config.rolesByType.organization as unknown as { key: string; value: string }[]}
      />
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
