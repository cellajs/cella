import { createRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { z } from 'zod';
import { zGetOrganizationsData, zGetRequestsData, zGetUsersData } from '~/api.gen/zod.gen';
import ErrorNotice from '~/modules/common/error-notice';
import SystemPage from '~/modules/system/system-page';
import { AppRoute } from '~/routes/base';
import appTitle from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access';

// Lazy-loaded route components
const OrganizationsTable = lazy(() => import('~/modules/organizations/table/table-wrapper'));
const UsersTable = lazy(() => import('~/modules/users/table/table-wrapper'));
const RequestsTable = lazy(() => import('~/modules/requests/table/table-wrapper'));
const RequestsPerMinute = lazy(() => import('~/modules/metrics/requests-per-minute'));

// Search query schemas
export const organizationsSearchSchema = zGetOrganizationsData.shape.query.unwrap().pick({ q: true, sort: true, order: true });
const baseUsersSearchSchema = zGetUsersData.shape.query.unwrap().pick({ q: true, sort: true, order: true, role: true });
export const usersSearchSchema = z.object({ ...baseUsersSearchSchema.shape, userSheetId: z.string().optional() });
export const requestSearchSchema = zGetRequestsData.shape.query.unwrap().pick({ q: true, sort: true, order: true });

export const SystemRoute = createRoute({
  path: '/system',
  staticData: { isAuth: true },
  beforeLoad: ({ location }) => noDirectAccess(location.pathname, 'system', '/users'),
  getParentRoute: () => AppRoute,
  component: () => <SystemPage />,
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
});

export const UsersTableRoute = createRoute({
  path: '/users',
  validateSearch: usersSearchSchema,
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Users') }] }),
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
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Organizations') }] }),
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
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Requests') }] }),
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
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Metrics') }] }),
  getParentRoute: () => SystemRoute,
  component: () => (
    <Suspense>
      <RequestsPerMinute />
    </Suspense>
  ),
});
