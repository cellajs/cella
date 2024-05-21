import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { getOrganizationsQuerySchema } from 'backend/modules/organizations/schema';
import { getUsersQuerySchema } from 'backend/modules/users/schema';
import { getRequestsQuerySchema } from 'backend/modules/general/schema';
import { Suspense, lazy } from 'react';
import { noDirectAccess } from '~/lib/utils';
import ErrorNotice from '~/modules/common/error-notice';
import SystemPanel from '~/modules/system/system-panel';
import { IndexRoute } from './routeTree';

// Lazy-loaded route components
const OrganizationsTable = lazy(() => import('~/modules/organizations/organizations-table'));
const UsersTable = lazy(() => import('~/modules/users/users-table'));
const RequestsTable = lazy(() => import('~/modules/requests/requests-table'));

const organizationsSearchSchema = getOrganizationsQuerySchema.pick({ q: true, sort: true, order: true });
const usersSearchSchema = getUsersQuerySchema.pick({ q: true, sort: true, order: true, role: true });
const requestSearchSchema = getRequestsQuerySchema.pick({ q: true, sort: true, order: true });

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
      <UsersTable />
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
