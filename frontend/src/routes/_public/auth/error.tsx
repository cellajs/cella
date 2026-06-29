import { createFileRoute } from '@tanstack/react-router';
import { AuthErrorPage } from '~/modules/auth/auth-error-page';
import { authErrorRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import appTitle from '~/utils/app-title';

/**
 * Error page for authentication-related failures.
 */
export const Route = createFileRoute('/_public/auth/error')({
  validateSearch: authErrorRouteSearchParamsSchema,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Authentication error') }] }),
  component: AuthErrorPage,
});
