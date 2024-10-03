import { createRoute } from '@tanstack/react-router';
import { getOrganizationsQuerySchema } from 'backend/modules/organizations/schema';
import { getRequestsQuerySchema } from 'backend/modules/requests/schema';
import { usersQuerySchema } from 'backend/modules/users/schema';
import { Suspense, lazy } from 'react';
import { z } from 'zod';
import { queryClient } from '~/lib/router';
import ErrorNotice from '~/modules/common/error-notice';
import { organizationsQueryOptions } from '~/modules/organizations/organizations-table/helpers/query-options';
import { requestsQueryOptions } from '~/modules/system/requests-table';
import SystemPage from '~/modules/system/system-page';
import { usersQueryOptions } from '~/modules/users/users-table/helpers/query-options';
import { noDirectAccess } from '~/utils/no-direct-access';
import type { ErrorType } from '#/lib/errors';
import { AppRoute } from './general';

// Lazy-loaded route components
const OrganizationsTable = lazy(() => import('~/modules/organizations/organizations-table'));
const UsersTable = lazy(() => import('~/modules/users/users-table'));
const RequestsTable = lazy(() => import('~/modules/system/requests-table'));
const RequestsPerMinute = lazy(() => import('~/modules/system/metrics-charts/requests-per-minute'));

// Search query schemas
const organizationsSearchSchema = getOrganizationsQuerySchema.pick({ q: true, sort: true, order: true });
const baseUsersSearchSchema = usersQuerySchema.pick({ q: true, sort: true, order: true, role: true });
const usersSearchSchema = z.object({
  ...baseUsersSearchSchema.shape,
  userIdPreview: z.string().optional(),
});
const requestSearchSchema = getRequestsQuerySchema.pick({ q: true, sort: true, order: true });

export const SystemRoute = createRoute({
  path: '/system',
  staticData: { pageTitle: 'System panel', isAuth: true },
  beforeLoad: ({ location }) => noDirectAccess(location.pathname, 'system', '/users'),
  getParentRoute: () => AppRoute,
  component: () => <SystemPage />,
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
});

export const UsersTableRoute = createRoute({
  path: '/users',
  validateSearch: usersSearchSchema,
  staticData: { pageTitle: 'Users', isAuth: true },
  getParentRoute: () => SystemRoute,
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
  getParentRoute: () => SystemRoute,
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
  getParentRoute: () => SystemRoute,
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

export const MetricsRoute = createRoute({
  path: '/metrics',
  validateSearch: requestSearchSchema,
  staticData: { pageTitle: 'Metrics', isAuth: true },
  getParentRoute: () => SystemRoute,
  component: () => (
    <Suspense>
      <RequestsPerMinute />
    </Suspense>
  ),
});
