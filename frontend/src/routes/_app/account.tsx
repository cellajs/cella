import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { withSuspenseSpinner } from '~/modules/common/with-suspense';
import { AccountPage } from '~/modules/me/account-page';
import { accountBeforeLoad, accountLoader } from '~/modules/me/route-logic';
import { accountRouteSearchParamsSchema } from '~/modules/me/search-params-schemas';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/account')({
  validateSearch: accountRouteSearchParamsSchema,
  beforeLoad: ({ search }) => accountBeforeLoad(search),
  loader: accountLoader,
  head: () => pageHead(i18n.t('c:account_settings')),
  component: withSuspenseSpinner(AccountPage),
});
