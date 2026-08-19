import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { usersRouteSearchParamsSchema, usersSearchDefaults } from '~/modules/user/search-params-schemas';
import { withSuspense } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const UsersTable = lazyNamed(() => import('~/modules/user/table/users-table'), 'UsersTable');

export const Route = createFileRoute('/_app/system/users')({
  validateSearch: usersRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(usersSearchDefaults)] },
  staticData: { isAuth: true, navTab: { id: 'users', label: 'c:user_other', description: 'c:tab_users.text' } },
  head: () => ({ meta: [{ title: appTitle('Users') }] }),
  component: withSuspense(UsersTable),
});
