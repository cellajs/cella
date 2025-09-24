import { createRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import ErrorNotice from '~/modules/common/error-notice';
import SystemPage from '~/modules/system/system-page';
import { AppRoute } from '~/routes/base-routes';
import appTitle from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access';
import { organizationsRouteSearchParamsSchema, requestsRouteSearchParamsSchema, usersRouteSearchParamsSchema } from './search-params-schemas';

// Lazy-loaded route components
const OrganizationsTable = lazy(() => import('~/modules/organizations/table'));
const UsersTable = lazy(() => import('~/modules/users/table'));
const RequestsTable = lazy(() => import('~/modules/requests/table'));
const RequestsPerMinute = lazy(() => import('~/modules/metrics/requests-per-minute'));

export const SystemRoute = createRoute({
  path: '/system',
  staticData: { isAuth: true },
  beforeLoad: () => {
    noDirectAccess(SystemRoute.to, UsersTableRoute.to);
  },
  getParentRoute: () => AppRoute,
  component: () => <SystemPage />,
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
});

export const UsersTableRoute = createRoute({
  path: '/users',
  validateSearch: usersRouteSearchParamsSchema,
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
  validateSearch: organizationsRouteSearchParamsSchema,
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
  validateSearch: requestsRouteSearchParamsSchema,
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
  validateSearch: requestsRouteSearchParamsSchema,
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Metrics') }] }),
  getParentRoute: () => SystemRoute,
  component: () => (
    <Suspense>
      <RequestsPerMinute />
    </Suspense>
  ),
});
