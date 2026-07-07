import { createFileRoute } from '@tanstack/react-router';
import { MfaPage } from '~/modules/auth/mfa-page';
import { authenticateRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { appTitle } from '~/utils/app-title';

/**
 * Multi-factor authentication verification page.
 */
export const Route = createFileRoute('/_public/auth/mfa')({
  validateSearch: authenticateRouteSearchParamsSchema,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Authenticate') }] }),
  component: MfaPage,
});
