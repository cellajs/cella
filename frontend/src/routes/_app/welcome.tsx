import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { redirectToHomeIfOnboarded } from '~/modules/home/route-logic';
import { meInvitationsQueryOptions } from '~/modules/me/query';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { userStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import { withSuspense } from '~/routes/-route-utils';
import { pageHead } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const WelcomePage = lazyNamed(() => import('~/modules/home/welcome-page'), 'WelcomePage');

export const Route = createFileRoute('/_app/welcome')({
  staticData: { isAuth: true },
  head: () => pageHead(i18n.t('c:welcome')),
  // Onboarding picks its steps once, from the user's organizations and pending invitations, so both load first.
  // A failed load falls back to the default steps; the queries retry inside the page.
  loader: async () => {
    const { user } = userStore.getState();
    if (!user) return;

    await Promise.allSettled([
      queryClient.infiniteQuery({ ...organizationsListQueryOptions({ relatableUserId: user.id }), staleTime: 'static' }),
      queryClient.query({ ...meInvitationsQueryOptions(), staleTime: 'static' }),
    ]);
  },
  onEnter: () => {
    redirectToHomeIfOnboarded();
  },
  component: withSuspense(WelcomePage),
});
