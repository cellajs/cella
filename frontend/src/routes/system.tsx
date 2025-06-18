import { createRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { z } from 'zod';

import { organizationListQuerySchema } from '#/modules/organizations/schema';
import { requestListQuerySchema } from '#/modules/requests/schema';
import { userListQuerySchema } from '#/modules/users/schema';

import ErrorNotice from '~/modules/common/error-notice';
import SystemPage from '~/modules/system/system-page';
import { AppRoute } from '~/routes/base';
import { noDirectAccess } from '~/utils/no-direct-access';

// Lazy-loaded route components
const OrganizationsTable = lazy(() => import('~/modules/organizations/table/table-wrapper'));
const UsersTable = lazy(() => import('~/modules/users/table/table-wrapper'));
const RequestsTable = lazy(() => import('~/modules/requests/table/table-wrapper'));
const RequestsPerMinute = lazy(() => import('~/modules/metrics/requests-per-minute'));

// Search query schemas
export const organizationsSearchSchema = organizationListQuerySchema.pick({ q: true, sort: true, order: true });
const baseUsersSearchSchema = userListQuerySchema.pick({ q: true, sort: true, order: true, role: true });
export const usersSearchSchema = z.object({ ...baseUsersSearchSchema.shape, userSheetId: z.string().optional() });
export const requestSearchSchema = requestListQuerySchema.pick({ q: true, sort: true, order: true });

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
