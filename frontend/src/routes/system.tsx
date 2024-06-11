import { infiniteQueryOptions } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { getRequestsQuerySchema } from 'backend/modules/requests/schema';
import { getOrganizationsQuerySchema } from 'backend/modules/organizations/schema';
import { getUsersQuerySchema } from 'backend/modules/users/schema';
import { UserRoundCheck } from 'lucide-react';
import { Suspense, lazy } from 'react';
import type { z } from 'zod';
import { type GetUsersParams, getUsers } from '~/api/users';
import { noDirectAccess } from '~/lib/utils';
import HeaderCell from '~/modules/common/data-table/header-cell';
import ErrorNotice from '~/modules/common/error-notice';
import SystemPanel from '~/modules/system/system-panel';
import UsersTable from '~/modules/users/users-table';
import type { User } from '~/types';
import { IndexRoute } from './routeTree';

// Lazy-loaded route components
const OrganizationsTable = lazy(() => import('~/modules/organizations/organizations-table'));
// const UsersTable = lazy(() => import('~/modules/users/users-table'));
const RequestsTable = lazy(() => import('~/modules/system/requests-table'));

const organizationsSearchSchema = getOrganizationsQuerySchema.pick({ q: true, sort: true, order: true });
const usersSearchSchema = getUsersQuerySchema.pick({ q: true, sort: true, order: true, role: true });
const requestSearchSchema = getRequestsQuerySchema.pick({ q: true, sort: true, order: true });

const usersQueryOptions = ({ q, sort: initialSort, order: initialOrder, role, limit }: GetUsersParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['users', q, sort, order, role],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getUsers(
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

export const SystemPanelRoute = createRoute({
  path: '/system',
  staticData: { pageTitle: 'System panel' },
  beforeLoad: ({ location }) => noDirectAccess(location.pathname, 'system', '/users'),
  getParentRoute: () => IndexRoute,
  component: () => <SystemPanel />,
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
});

export const UsersTableRoute = createRoute({
  path: '/users',
  staticData: { pageTitle: 'Users' },
  getParentRoute: () => SystemPanelRoute,
  component: () => (
    <Suspense>
      <UsersTable<User, GetUsersParams, z.infer<typeof getUsersQuerySchema>>
        queryOptions={usersQueryOptions}
        canInvite={true}
        routeFrom={UsersTableRoute.id}
        customColumns={[
          {
            key: 'membershipCount',
            name: 'Memberships',
            sortable: false,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => (
              <>
                <UserRoundCheck className="mr-2 opacity-50" size={16} />
                {row.counts?.memberships | 0}
              </>
            ),
            width: 140,
          },
        ]}
      />
    </Suspense>
  ),
  validateSearch: usersSearchSchema,
});

export const OrganizationsTableRoute = createRoute({
  path: '/organizations',
  staticData: { pageTitle: 'Organizations' },
  getParentRoute: () => SystemPanelRoute,
  component: () => (
    <Suspense>
      <OrganizationsTable />
    </Suspense>
  ),
  validateSearch: organizationsSearchSchema,
});

export const RequestsTableRoute = createRoute({
  path: '/requests',
  staticData: { pageTitle: 'Requests' },
  getParentRoute: () => SystemPanelRoute,
  component: () => (
    <Suspense>
      <RequestsTable />
    </Suspense>
  ),
  validateSearch: requestSearchSchema,
});
