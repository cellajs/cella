import { type ParsedLocation, redirect } from '@tanstack/react-router';
import { ApiError } from '~/lib/api';
import { requireSession } from '~/modules/auth/route-logic';
import { myMembershipsQueryOptions, readMe } from '~/modules/me/query';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers/get-menu-data';
import { unseenCountsQueryOptions } from '~/modules/seen/query';
import { userStore } from '~/modules/user/user-store';
import { localUserStorageReady } from '~/query/local-user-storage';
import { queryClient } from '~/query/query-client';
import { streamManager } from '~/query/realtime/stream-manager';

type RouteCause = 'preload' | 'enter' | 'stay';

/**
 * `beforeLoad` of the app layout: the sign-in gate of every page below it, then the boot on entry. A signed-out visit to
 * `/` goes to the about page on a first visit and to sign-in after an earlier one; any other path goes to sign-in with
 * the path to return to.
 */
export async function appLayoutBeforeLoad({ location, cause }: { location: ParsedLocation; cause: RouteCause }): Promise<void> {
  if (location.pathname === '/' && !userStore.getState().user) {
    if (!userStore.getState().lastUser) throw redirect({ to: '/about', replace: true });
    // The cookie can still be valid while the store is empty after a backend-driven sign-in, so probe /me first.
    try {
      await readMe();
    } catch {
      throw redirect({ to: '/auth/authenticate', search: { fromRoot: true }, replace: true });
    }
  }
  await requireSession(location);
  if (cause !== 'enter') return;

  // Catchup needs the rehydrated cursor and the restored cache: a list not restored yet counts as uncached, its gap skipped for good.
  await localUserStorageReady();
  // Catchup declares a view per organization of the cached memberships, so a fresh profile reads them first; the loader reports a failure.
  await queryClient.query({ ...myMembershipsQueryOptions(), staleTime: 'static' }).catch(() => {});
  // Start stream early so catchup runs in parallel with route loaders
  streamManager.connect();
  // Only a 401 ends the session. A network failure or 5xx keeps the stream: disconnect() also drops its visibility and
  // leader reconnect handlers, so nothing would bring it back for the rest of the session.
  readMe().catch((error) => {
    if (error instanceof ApiError && error.status === 401) streamManager.disconnect();
  });
}

/** `loader` of the app layout, on entry: the unseen counts in the background, the menu before the first page. */
export async function appLayoutLoader(cause: RouteCause): Promise<void> {
  if (cause !== 'enter') return;

  void queryClient.query(unseenCountsQueryOptions()).catch(() => {});
  await getMenuData();
}
