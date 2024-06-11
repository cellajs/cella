import { infiniteQueryOptions } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { getMembersQuerySchema } from 'backend/modules/general/schema';
import { Suspense } from 'react';
import type { z } from 'zod';
import { type GetMembersParams, getMembers } from '~/api/general';
import { queryClient } from '~/lib/router';
import { noDirectAccess } from '~/lib/utils';
import ErrorNotice from '~/modules/common/error-notice';
import Organization, { organizationQueryOptions } from '~/modules/organizations/organization';
import OrganizationSettings from '~/modules/organizations/organization-settings';
import UsersTable from '~/modules/users/users-table';
import type { ContextEntity, Member } from '~/types';
import { IndexRoute } from './routeTree';

// Lazy-loaded components
// const UsersTable = lazy(() => import('~/modules/users/users-table'));

const membersSearchSchema = getMembersQuerySchema.pick({ q: true, sort: true, order: true, role: true });

const membersQueryOptions = ({
  idOrSlug,
  entityType,
  q,
  sort: initialSort,
  order: initialOrder,
  role,
  limit,
}: GetMembersParams & { idOrSlug: string; entityType: ContextEntity }) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['members', idOrSlug, entityType, q, sort, order, role],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getMembers(
        {
          idOrSlug,
          entityType: 'ORGANIZATION',
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
    const entityType = 'ORGANIZATION';
    const membersInfiniteQueryOptions = membersQueryOptions({ idOrSlug, entityType, q, sort, order, role });
    const cachedMembers = queryClient.getQueryData(membersInfiniteQueryOptions.queryKey);
    if (!cachedMembers) {
      queryClient.fetchInfiniteQuery(membersInfiniteQueryOptions);
    }
  },
  component: () => (
    <Suspense>
      <UsersTable<Member, GetMembersParams & { idOrSlug: string; entityType: ContextEntity }, z.infer<typeof getMembersQuerySchema>>
        entityType="ORGANIZATION"
        canInvite={true}
        queryOptions={membersQueryOptions}
        routeFrom={OrganizationMembersRoute.id}
        fetchForExport={getMembers}
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
