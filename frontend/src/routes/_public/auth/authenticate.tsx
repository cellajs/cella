import { createFileRoute, redirect } from '@tanstack/react-router';
import i18n from 'i18next';
import { authStore } from '~/modules/auth/auth-store';
import { AuthenticatePage } from '~/modules/auth/authenticate-page';
import { authenticateRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { resolvePostAuthRedirect } from '~/modules/auth/use-post-auth-redirect';
import { meKeys, meQueryOptions } from '~/modules/me/query';
import { userStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/authenticate')({
  validateSearch: authenticateRouteSearchParamsSchema,
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:authentication')),
  beforeLoad: async ({ cause, search }) => {
    authStore.getState().reset();

    // Invitation flow: a signed-in visitor stays to confirm the invitation as their account. Probed on every pass,
    // so a sign-in made on this page reaches the confirm step too.
    if (search.tokenId) {
      try {
        await queryClient.query(meQueryOptions());
      } catch {
        queryClient.removeQueries({ queryKey: meKeys.all, exact: true }); // No valid session -> sign-up or sign-in steps
      }
      return;
    }

    // `fromRoot` means a route guard already probed the session and found none; probing again would loop.
    if (cause !== 'enter' || search.fromRoot) return;

    // The session cookie is the authority: after a magic-link or OAuth sign-in it is valid while the store is empty.
    if (!userStore.getState().user) {
      try {
        await queryClient.query({ ...meQueryOptions(), staleTime: 'static' });
      } catch {
        return; // No valid session -> show the authenticate page
      }
    }

    throw redirect({ to: resolvePostAuthRedirect(search.redirect), replace: true });
  },
  component: AuthenticatePage,
});
