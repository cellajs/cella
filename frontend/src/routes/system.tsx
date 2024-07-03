import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { getOrganizationsQuerySchema } from 'backend/modules/organizations/schema';
import { getRequestsQuerySchema } from 'backend/modules/requests/schema';
import { usersQuerySchema } from 'backend/modules/users/schema';
import { Suspense, lazy } from 'react';
import { queryClient } from '~/lib/router';
import { noDirectAccess } from '~/lib/utils';
import ErrorNotice from '~/modules/common/error-notice';
import { organizationsQueryOptions } from '~/modules/organizations/organizations-table';
import { requestsQueryOptions } from '~/modules/system/requests-table';
import SystemPanel from '~/modules/system/system-panel';
import { usersQueryOptions } from '~/modules/users/users-table';
import { AppRoute } from '.';

// Lazy-loaded route components
const OrganizationsTable = lazy(() => import('~/modules/organizations/organizations-table'));
const UsersTable = lazy(() => import('~/modules/users/users-table'));
const RequestsTable = lazy(() => import('~/modules/system/requests-table'));

// Search query schemas
const organizationsSearchSchema = getOrganizationsQuerySchema.pick({ q: true, sort: true, order: true });
const usersSearchSchema = usersQuerySchema.pick({ q: true, sort: true, order: true, role: true });
const requestSearchSchema = getRequestsQuerySchema.pick({ q: true, sort: true, order: true });

export const SystemPanelRoute = createRoute({
  path: '/system',
  staticData: { pageTitle: 'System panel', isAuth: true },
  beforeLoad: ({ location }) => noDirectAccess(location.pathname, 'system', '/users'),
  getParentRoute: () => AppRoute,
  component: () => <SystemPanel />,
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
});

export const UsersTableRoute = createRoute({
  path: '/users',
  validateSearch: usersSearchSchema,
  staticData: { pageTitle: 'Users', isAuth: true },
  getParentRoute: () => SystemPanelRoute,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  loader: async ({ deps: { q, sort, order, role } }) => {
    const infiniteQueryOptions = usersQueryOptions({ q, sort, order, role, limit: 100 });
    const cachedUsers = queryClient.getQueryData(infiniteQueryOptions.queryKey);
    if (!cachedUsers) {
      queryClient.fetchInfiniteQuery(infiniteQueryOptions);
    }
  },
  component: () => (
    <Suspense>
      <UsersTable />
    </Suspense>
  ),
});

export const OrganizationsTableRoute = createRoute({
  path: '/organizations',
  validateSearch: organizationsSearchSchema,
  staticData: { pageTitle: 'Organizations', isAuth: true },
  getParentRoute: () => SystemPanelRoute,
  loaderDeps: ({ search: { q, sort, order } }) => ({ q, sort, order }),
  loader: async ({ deps: { q, sort, order } }) => {
    const infiniteQueryOptions = organizationsQueryOptions({ q, sort, order, limit: 40 });
    const cachedOrganizations = queryClient.getQueryData(infiniteQueryOptions.queryKey);
    if (!cachedOrganizations) {
      queryClient.fetchInfiniteQuery(infiniteQueryOptions);
    }
  },
  component: () => (
    <Suspense>
      <OrganizationsTable />
    </Suspense>
  ),
});

export const RequestsTableRoute = createRoute({
  path: '/requests',
  validateSearch: requestSearchSchema,
  staticData: { pageTitle: 'Requests', isAuth: true },
  getParentRoute: () => SystemPanelRoute,
  loaderDeps: ({ search: { q, sort, order } }) => ({ q, sort, order }),
  loader: async ({ deps: { q, sort, order } }) => {
    const infiniteQueryOptions = requestsQueryOptions({ q, sort, order, limit: 40 });
    const cachedRequests = queryClient.getQueryData(infiniteQueryOptions.queryKey);
    if (!cachedRequests) {
      queryClient.fetchInfiniteQuery(infiniteQueryOptions);
    }
  },
  component: () => (
    <Suspense>
      <RequestsTable />
    </Suspense>
  ),
});
