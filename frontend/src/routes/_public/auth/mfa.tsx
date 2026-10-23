import { createFileRoute, redirect } from '@tanstack/react-router';
import i18n from 'i18next';
import { MfaPage } from '~/modules/auth/mfa-page';
import { authenticateRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { userStore } from '~/modules/user/user-store';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/mfa')({
  validateSearch: authenticateRouteSearchParamsSchema,
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:authentication')),
  // The second factor completes a sign-in that named the account; without one there is nothing to complete.
  beforeLoad: () => {
    if (!userStore.getState().lastUser?.email) throw redirect({ to: '/auth/authenticate', replace: true });
  },
  component: MfaPage,
});
