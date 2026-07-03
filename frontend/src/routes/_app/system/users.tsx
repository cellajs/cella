import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';
import { usersRouteSearchParamsSchema } from '~/modules/user/search-params-schemas';
import { withSuspense } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';

const UsersTable = lazy(() => import('~/modules/user/table/users-table'));

/**
 * System users table for managing all platform users.
 */
export const Route = createFileRoute('/_app/system/users')({
  validateSearch: usersRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'users', label: 'c:user_other' } },
  head: () => ({ meta: [{ title: appTitle('Users') }] }),
  component: withSuspense(UsersTable),
});
