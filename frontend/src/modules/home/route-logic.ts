import { redirect } from '@tanstack/react-router';
import { meInvitationsQueryOptions } from '~/modules/me/query';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers/get-menu-data';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { userStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';

type RouteCause = 'preload' | 'enter' | 'stay';

/** `beforeLoad` of the home pages: a user still onboarding enters the welcome page, unless the home page was asked for (`skipWelcome`). */
export function homeBeforeLoad({ cause, skipWelcome }: { cause: RouteCause; skipWelcome?: boolean }): void {
  if (cause !== 'enter' || skipWelcome) return;
  const { user } = userStore.getState();
  if (user && !user.userFlags.finishedOnboarding) throw redirect({ to: '/welcome', replace: true });
}

/** `beforeLoad` of the welcome page: an onboarded user enters the home page. */
export function welcomeBeforeLoad({ cause }: { cause: RouteCause }): void {
  if (cause !== 'enter') return;
  if (userStore.getState().user?.userFlags.finishedOnboarding) throw redirect({ to: '/home', replace: true });
}

/**
 * `loader` of the welcome page. Onboarding picks its steps once, from the user's organizations and pending invitations,
 * so both load first; the menu names the channel a member joined. A failed load falls back to the default steps; the
 * queries retry inside the page.
 */
export async function welcomeLoader(): Promise<void> {
  const { user } = userStore.getState();
  if (!user) return;

  await Promise.allSettled([
    queryClient.infiniteQuery({ ...organizationsListQueryOptions({ relatableUserId: user.id }), staleTime: 'static' }),
    queryClient.query({ ...meInvitationsQueryOptions(), staleTime: 'static' }),
    getMenuData(),
  ]);
}
