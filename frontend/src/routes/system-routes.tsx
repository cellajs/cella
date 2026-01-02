import { createRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import ErrorNotice from '~/modules/common/error-notice';
import PagesTable from '~/modules/pages/table';
import SystemPage from '~/modules/system/system-page';
import { AppLayoutRoute } from '~/routes/base-routes';
import {
  organizationsRouteSearchParamsSchema,
  pagesRouteSearchParamsSchema,
  requestsRouteSearchParamsSchema,
  usersRouteSearchParamsSchema,
} from '~/routes/search-params-schemas';
import appTitle from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access'; // Lazy-loaded route components

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
  getParentRoute: () => AppLayoutRoute,
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

export const PagesTableRoute = createRoute({
  path: '/pages',
  validateSearch: pagesRouteSearchParamsSchema,
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Pages') }] }),
  getParentRoute: () => SystemRoute,
  loaderDeps: ({ search: { q, sort, order } }) => ({ q, sort, order }),
  component: () => (
    <Suspense>
      <PagesTable />
    </Suspense>
  ),
});

export const MetricsRoute = createRoute({
  path: '/metrics',
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Metrics') }] }),
  getParentRoute: () => SystemRoute,
  component: () => (
    <Suspense>
      <RequestsPerMinute />
    </Suspense>
  ),
});
