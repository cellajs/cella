import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { signOutRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { SignOutPage } from '~/modules/auth/sign-out-page';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/sign-out')({
  validateSearch: signOutRouteSearchParamsSchema,
  head: () => pageHead(i18n.t('c:sign_out')),
  component: SignOutPage,
});
