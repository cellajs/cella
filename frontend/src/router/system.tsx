import { createRoute, redirect } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { getOrganizationsQuerySchema } from 'backend/modules/organizations/schema';
import { getUsersQuerySchema } from 'backend/modules/users/schema';
import ErrorNotice from '~/modules/common/error-notice';
import OrganizationsTable from '~/modules/organizations/organizations-table';
import SystemPanel from '~/modules/system/system-panel';
import UsersTable from '~/modules/users/users-table';
import { IndexRoute } from './routeTree';

const organizationsSearchSchema = getOrganizationsQuerySchema.pick({ q: true, sort: true, order: true });
const usersSearchSchema = getUsersQuerySchema.pick({ q: true, sort: true, order: true, role: true });

export const SystemPanelRoute = createRoute({
  path: '/system',
  beforeLoad: ({ location }) => {
    if (location.pathname === '/system') {
      throw redirect({ to: '/system/users', replace: true });
    }
    return { getTitle: () => 'System' };
  },
  getParentRoute: () => IndexRoute,
  component: () => <SystemPanel />,
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
});

export const UsersTableRoute = createRoute({
  path: '/users',
  beforeLoad: () => ({ getTitle: () => 'Users' }),
  getParentRoute: () => SystemPanelRoute,
  component: () => <UsersTable />,
  validateSearch: usersSearchSchema,
});

export const OrganizationsTableRoute = createRoute({
  path: '/organizations',
  beforeLoad: () => ({ getTitle: () => 'Organizations' }),
  getParentRoute: () => SystemPanelRoute,
  component: () => <OrganizationsTable />,
  validateSearch: organizationsSearchSchema,
});
