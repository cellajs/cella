import { type ParsedLocation, redirect } from '@tanstack/react-router';
import type { z } from 'zod';
import { ApiError } from '~/lib/api';
import { authStore } from '~/modules/auth/auth-store';
import { resolvePostAuthRedirect } from '~/modules/auth/post-auth-redirect';
import { pendingMfaQueryOptions } from '~/modules/auth/query';
import type { authenticateRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { meKeys, meQueryOptions, readMe } from '~/modules/me/query';
import { userStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';

type RouteCause = 'preload' | 'enter' | 'stay';

/**
 * Passes with a user in the store or a session cookie the server still accepts; else sends the visitor to sign in, with the
 * path to come back to. The `_app` layout calls it for every page below it; a page under `_public` that needs an account
 * calls it in its own `beforeLoad`.
 * @throws The sign-in redirect on a 401. A network failure or 5xx rethrows to the error boundary: only a definitive 401 means signed out.
 */
export async function requireSession(location: ParsedLocation): Promise<void> {
  if (userStore.getState().user) return;
  try {
    await readMe();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    // `fromRoot`: the session was probed here, so the sign-in page does not probe it again
    throw redirect({ to: '/auth/authenticate', search: { fromRoot: true, redirect: location.pathname + location.searchStr } });
  }
}

/** `beforeLoad` of the public layout: hydrates the user without blocking paint on `/me`; the query cache reports a failure. Sign-out skips it. */
export function publicLayoutBeforeLoad({ location, cause }: { location: ParsedLocation; cause: RouteCause }): void {
  if (cause !== 'enter' || location.pathname === '/auth/sign-out') return;
  readMe().catch(() => {});
}

type AuthenticateSearch = z.output<typeof authenticateRouteSearchParamsSchema>;

/**
 * `beforeLoad` of the sign-in page. A signed-in visitor leaves for where sign-in would have taken them, since the session
 * cookie is the authority: after a magic-link or OAuth sign-in it is valid while the store is empty. An invitation
 * (`tokenId`) keeps a signed-in visitor on the page, to confirm the invitation as their account.
 */
export async function authenticateBeforeLoad({ cause, search }: { cause: RouteCause; search: AuthenticateSearch }): Promise<void> {
  authStore.getState().reset();

  // Probed on every pass, so a sign-in made on this page reaches the confirm step too.
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

  if (!userStore.getState().user) {
    try {
      await readMe();
    } catch {
      return; // No valid session -> show the authenticate page
    }
  }

  throw redirect({ to: resolvePostAuthRedirect(search.redirect), replace: true });
}

/** `beforeLoad` of the second-factor page: it completes the challenge a sign-in left in this browser's cookie; without one there is nothing to complete. */
export async function mfaBeforeLoad(): Promise<void> {
  await queryClient.query({ ...pendingMfaQueryOptions, staleTime: 0 }).catch(() => {
    throw redirect({ to: '/auth/authenticate', replace: true });
  });
}
