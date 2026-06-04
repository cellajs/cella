import { createRoute } from '@tanstack/react-router';
import { lazy } from 'react';
import { organizationsRouteSearchParamsSchema } from '~/modules/organization/search-params-schemas';
import { requestsRouteSearchParamsSchema } from '~/modules/requests/search-params-schemas';
import { SystemPage } from '~/modules/system/system-page';
import { tenantsRouteSearchParamsSchema } from '~/modules/tenants/search-params-schemas';
import { usersRouteSearchParamsSchema } from '~/modules/user/search-params-schemas';
import { AppLayoutRoute } from '~/routes/base-routes';
import { createErrorComponent, withSuspense } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access';

const OrganizationsTable = lazy(() => import('~/modules/organization/table/organizations-table'));
const UsersTable = lazy(() => import('~/modules/user/table/users-table'));
const RequestsTable = lazy(() => import('~/modules/requests/table/requests-table'));
const TenantsTable = lazy(() => import('~/modules/tenants/table/tenants-table'));

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
  component: SystemPage,
  errorComponent: createErrorComponent('app'),
});

/**
 * System users table for managing all platform users.
 */
export const UsersTableRoute = createRoute({
  path: '/users',
  validateSearch: usersRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'users', label: 'c:users' } },
  head: () => ({ meta: [{ title: appTitle('Users') }] }),
  getParentRoute: () => SystemRoute,
  component: withSuspense(UsersTable),
});

/**
 * System organizations table for managing all organizations.
 */
export const OrganizationsTableRoute = createRoute({
  path: '/organizations',
  validateSearch: organizationsRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'organizations', label: 'c:organizations' } },
  head: () => ({ meta: [{ title: appTitle('Organizations') }] }),
  getParentRoute: () => SystemRoute,
  component: withSuspense(OrganizationsTable),
});

/**
 * System requests table for reviewing access requests.
 */
export const RequestsTableRoute = createRoute({
  path: '/requests',
  validateSearch: requestsRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'requests', label: 'c:requests' } },
  head: () => ({ meta: [{ title: appTitle('Requests') }] }),
  getParentRoute: () => SystemRoute,
  component: withSuspense(RequestsTable),
});

/**
 * System tenants table for managing multi-tenant isolation.
 */
export const TenantsTableRoute = createRoute({
  path: '/tenants',
  validateSearch: tenantsRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'tenants', label: 'c:tenants' } },
  head: () => ({ meta: [{ title: appTitle('Tenants') }] }),
  getParentRoute: () => SystemRoute,
  component: withSuspense(TenantsTable),
});
