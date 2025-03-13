import { createRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { z } from 'zod';

import { getOrganizationsQuerySchema } from '#/modules/organizations/schema';
import { getRequestsQuerySchema } from '#/modules/requests/schema';
import { usersQuerySchema } from '#/modules/users/schema';

import ErrorNotice from '~/modules/common/error-notice';
import { organizationsQueryOptions } from '~/modules/organizations/query';
import { requestsQueryOptions } from '~/modules/requests/query';
import SystemPage from '~/modules/system/system-page';
import { usersQueryOptions } from '~/modules/users/query';
import { queryClient } from '~/query/query-client';
import { AppRoute } from '~/routes/base';
import { noDirectAccess } from '~/utils/no-direct-access';

// Lazy-loaded route components
const OrganizationsTable = lazy(() => import('~/modules/organizations/table/table-wrapper'));
const UsersTable = lazy(() => import('~/modules/users/table/table-wrapper'));
const RequestsTable = lazy(() => import('~/modules/requests/table/table-wrapper'));
const RequestsPerMinute = lazy(() => import('~/modules/metrics/requests-per-minute'));

// Search query schemas
export const organizationsSearchSchema = getOrganizationsQuerySchema.pick({ q: true, sort: true, order: true });
const baseUsersSearchSchema = usersQuerySchema.pick({ q: true, sort: true, order: true, role: true });
export const usersSearchSchema = z.object({
  ...baseUsersSearchSchema.shape,
  userSheetId: z.string().optional(),
  sheetContext: z.string().optional(),
});
export const requestSearchSchema = getRequestsQuerySchema.pick({ q: true, sort: true, order: true });

export const SystemRoute = createRoute({
  path: '/system',
  staticData: { pageTitle: 'System', isAuth: true },
  beforeLoad: ({ location }) => noDirectAccess(location.pathname, 'system', '/users'),
  getParentRoute: () => AppRoute,
  component: () => <SystemPage />,
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
});

export const UsersTableRoute = createRoute({
  path: '/users',
  validateSearch: usersSearchSchema,
  staticData: { pageTitle: 'users', isAuth: true },
  getParentRoute: () => SystemRoute,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  loader: async ({ deps: { q, sort, order, role } }) => {
    const queryOptions = usersQueryOptions({ q, sort, order, role });
    await queryClient.prefetchInfiniteQuery(queryOptions);
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
  staticData: { pageTitle: 'organizations', isAuth: true },
  getParentRoute: () => SystemRoute,
  loaderDeps: ({ search: { q, sort, order } }) => ({ q, sort, order }),
  loader: async ({ deps: { q, sort, order } }) => {
    const orgOptions = organizationsQueryOptions({ q, sort, order });
    await queryClient.prefetchInfiniteQuery(orgOptions);
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
  staticData: { pageTitle: 'requests', isAuth: true },
  getParentRoute: () => SystemRoute,
  loaderDeps: ({ search: { q, sort, order } }) => ({ q, sort, order }),
  loader: async ({ deps: { q, sort, order } }) => {
    const requestsOptions = requestsQueryOptions({ q, sort, order });
    await queryClient.prefetchInfiniteQuery(requestsOptions);
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
  staticData: { pageTitle: 'metrics', isAuth: true },
  getParentRoute: () => SystemRoute,
  component: () => (
    <Suspense>
      <RequestsPerMinute />
    </Suspense>
  ),
});
