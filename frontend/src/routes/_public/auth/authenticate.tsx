import { createFileRoute, redirect } from '@tanstack/react-router';
import { useAuthStore } from '~/modules/auth/auth-store';
import { AuthenticatePage } from '~/modules/auth/authenticate-page';
import { authenticateRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { resolvePostAuthRedirect } from '~/modules/auth/use-post-auth-redirect';
import { meKeys, meQueryOptions } from '~/modules/me/query';
import { useUserStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import { appTitle } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/authenticate')({
  validateSearch: authenticateRouteSearchParamsSchema,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Authenticate') }] }),
  beforeLoad: async ({ cause, search }) => {
    useAuthStore.getState().resetSteps();

    // Invitation flow: a signed-in visitor stays to confirm the invitation as their account. Probed on every pass,
    // so a sign-in made on this page lands on the confirm step too.
    if (search.tokenId) {
      try {
        await queryClient.fetchQuery({ ...meQueryOptions() });
      } catch {
        queryClient.removeQueries({ queryKey: meKeys.all, exact: true }); // No valid session -> sign-up or sign-in steps
      }
      return;
    }

    // `fromRoot` means a route guard already probed the session and found none; probing again would loop.
    if (cause !== 'enter' || search.fromRoot) return;

    // The session cookie is the authority: after a magic-link or OAuth sign-in it is valid while the store is empty.
    if (!useUserStore.getState().user) {
      try {
        await queryClient.ensureQueryData({ ...meQueryOptions() });
      } catch {
        return; // No valid session -> show the authenticate page
      }
    }

    throw redirect({ to: resolvePostAuthRedirect(search.redirect), replace: true });
  },
  component: AuthenticatePage,
});
