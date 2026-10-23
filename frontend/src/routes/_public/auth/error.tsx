import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { AuthErrorPage } from '~/modules/auth/auth-error-page';
import { authErrorRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/error')({
  validateSearch: authErrorRouteSearchParamsSchema,
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:authentication_error')),
  component: AuthErrorPage,
});
