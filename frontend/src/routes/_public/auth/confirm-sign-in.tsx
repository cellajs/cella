import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { ConfirmSignInPage } from '~/modules/auth/confirm-sign-in-page';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/confirm-sign-in')({
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:confirm_sign_in')),
  component: ConfirmSignInPage,
});
