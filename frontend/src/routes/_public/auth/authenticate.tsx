import { createFileRoute, redirect } from '@tanstack/react-router';
import { useAuthStore } from '~/modules/auth/auth-store';
import { AuthenticatePage } from '~/modules/auth/authenticate-page';
import { authenticateRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { resolvePostAuthRedirect } from '~/modules/auth/use-post-auth-redirect';
import { meQueryOptions } from '~/modules/me/query';
import { useUserStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import { appTitle } from '~/utils/app-title';

/**
 * Main authentication page for user sign-in and sign-up flows.
 */
export const Route = createFileRoute('/_public/auth/authenticate')({
  validateSearch: authenticateRouteSearchParamsSchema,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Authenticate') }] }),
  beforeLoad: async ({ cause, search }) => {
    useAuthStore.getState().resetSteps();

    // Only check auth if entering. `fromRoot` means a route guard already probed the session
    // and found none, so don't probe again (prevents a redirect loop).
    if (cause !== 'enter' || search.fromRoot) return;

    // The session cookie is the authority, not the persisted store: after a backend-driven
    // sign-in (magic link, OAuth) the cookie is valid while the store is still empty.
    if (!useUserStore.getState().user) {
      try {
        await queryClient.ensureQueryData({ ...meQueryOptions() });
      } catch {
        return; // No valid session -> show the authenticate page
      }
    }

    // Signed in: honor a validated redirect target, else go home
    throw redirect({ to: resolvePostAuthRedirect(search.redirect), replace: true });
  },
  component: AuthenticatePage,
});
