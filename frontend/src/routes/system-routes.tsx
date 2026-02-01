import { createRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import ErrorNotice from '~/modules/common/error-notice';
import { organizationsRouteSearchParamsSchema } from '~/modules/organization/search-params-schemas';
import { requestsRouteSearchParamsSchema } from '~/modules/requests/search-params-schemas';
import SystemPage from '~/modules/system/system-page';
import { usersRouteSearchParamsSchema } from '~/modules/user/search-params-schemas';
import { AppLayoutRoute } from '~/routes/base-routes';
import appTitle from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access'; // Lazy-loaded route components

// Lazy-loaded route components
const OrganizationsTable = lazy(() => import('~/modules/organization/table/organizations-table'));
const UsersTable = lazy(() => import('~/modules/user/table'));
const RequestsTable = lazy(() => import('~/modules/requests/table/requests-table'));
const RequestsPerMinute = lazy(() => import('~/modules/metrics/requests-per-minute'));

/**
 * System admin panel for platform-wide management.
 */
export const SystemRoute = createRoute({
  path: '/system',
  staticData: { isAuth: true },
  beforeLoad: () => {
    noDirectAccess(SystemRoute.to, UsersTableRoute.to);
  },
  getParentRoute: () => AppLayoutRoute,
  component: () => <SystemPage />,
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
});

/**
 * System users table for managing all platform users.
 */
export const UsersTableRoute = createRoute({
  path: '/users',
  validateSearch: usersRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'users', label: 'common:users' } },
  head: () => ({ meta: [{ title: appTitle('Users') }] }),
  getParentRoute: () => SystemRoute,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  component: () => (
    <Suspense>
      <UsersTable />
    </Suspense>
  ),
});

/**
 * System organizations table for managing all organizations.
 */
export const OrganizationsTableRoute = createRoute({
  path: '/organizations',
  validateSearch: organizationsRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'organizations', label: 'common:organizations' } },
  head: () => ({ meta: [{ title: appTitle('Organizations') }] }),
  getParentRoute: () => SystemRoute,
  loaderDeps: ({ search: { q, sort, order } }) => ({ q, sort, order }),
  component: () => (
    <Suspense>
      <OrganizationsTable />
    </Suspense>
  ),
});

/**
 * System requests table for reviewing access requests.
 */
export const RequestsTableRoute = createRoute({
  path: '/requests',
  validateSearch: requestsRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'requests', label: 'common:requests' } },
  head: () => ({ meta: [{ title: appTitle('Requests') }] }),
  getParentRoute: () => SystemRoute,
  loaderDeps: ({ search: { q, sort, order } }) => ({ q, sort, order }),
  component: () => (
    <Suspense>
      <RequestsTable />
    </Suspense>
  ),
});

/**
 * System metrics dashboard for monitoring platform performance.
 */
export const MetricsRoute = createRoute({
  path: '/metrics',
  staticData: { isAuth: true, navTab: { id: 'metrics', label: 'common:metrics' } },
  head: () => ({ meta: [{ title: appTitle('Metrics') }] }),
  getParentRoute: () => SystemRoute,
  component: () => (
    <Suspense>
      <RequestsPerMinute />
    </Suspense>
  ),
});
