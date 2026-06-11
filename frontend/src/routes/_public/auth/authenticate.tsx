import { createFileRoute, redirect } from '@tanstack/react-router';
import { appConfig } from 'shared';
import { useAuthStore } from '~/modules/auth/auth-store';
import { AuthenticatePage } from '~/modules/auth/authenticate-page';
import { authenticateRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { useUserStore } from '~/modules/user/user-store';
import appTitle from '~/utils/app-title';

/**
 * Main authentication page for user sign-in and sign-up flows.
 */
export const Route = createFileRoute('/_public/auth/authenticate')({
  validateSearch: authenticateRouteSearchParamsSchema,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Authenticate') }] }),
  beforeLoad: async ({ cause, search }) => {
    useAuthStore.getState().resetSteps();

    // Only check auth if entering to prevent loop
    if (cause !== 'enter' || search.fromRoot) return;

    // If stored user, redirect to home
    const { user: storedUser } = useUserStore.getState();
    if (!storedUser) return;
    throw redirect({ to: appConfig.defaultRedirectPath, replace: true });
  },
  component: AuthenticatePage,
});
