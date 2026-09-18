import { createFileRoute } from '@tanstack/react-router';
import { redirectToHomeIfOnboarded } from '~/modules/home/route-logic';
import { meInvitationsQueryOptions } from '~/modules/me/query';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { useUserStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import { withSuspense } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const WelcomePage = lazyNamed(() => import('~/modules/home/welcome-page'), 'WelcomePage');

export const Route = createFileRoute('/_app/welcome')({
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Welcome') }] }),
  // Onboarding picks its steps once, from the user's organizations and pending invitations, so both load first.
  // A failed load falls back to the default steps; the queries retry inside the page.
  loader: async () => {
    const { user } = useUserStore.getState();
    if (!user) return;

    await Promise.allSettled([
      queryClient.ensureInfiniteQueryData(organizationsListQueryOptions({ relatableUserId: user.id })),
      queryClient.ensureQueryData(meInvitationsQueryOptions()),
    ]);
  },
  onEnter: () => {
    redirectToHomeIfOnboarded();
  },
  component: withSuspense(WelcomePage),
});
