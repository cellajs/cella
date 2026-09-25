import { createFileRoute } from '@tanstack/react-router';
import { ConfirmSignInPage } from '~/modules/auth/confirm-sign-in-page';
import { appTitle } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/confirm-sign-in')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Confirm sign-in') }] }),
  component: ConfirmSignInPage,
});
