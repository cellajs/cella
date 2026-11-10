import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import i18n from 'i18next';
import { withSuspense } from '~/modules/common/with-suspense';
import { usersRouteSearchParamsSchema, usersSearchDefaults } from '~/modules/user/search-params-schemas';
import { UsersTable } from '~/modules/user/table/users-table';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/system/users')({
  staticData: { navTab: { id: 'users', label: 'c:user_other', description: 'c:tab_users.text' } },
  validateSearch: usersRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(usersSearchDefaults)] },
  head: () => pageHead(i18n.t('c:user_other')),
  component: withSuspense(UsersTable),
});
