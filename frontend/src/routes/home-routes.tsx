import { createRoute, redirect } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import z from 'zod';
import Home from '~/modules/home';
import { AppLayoutRoute } from '~/routes/base-routes';
import { useUserStore } from '~/store/user';
import appTitle from '~/utils/app-title';

const Welcome = lazy(() => import('~/modules/home/welcome-page'));

export const HomeRoute = createRoute({
  path: '/',
  head: () => ({ meta: [{ title: appTitle('Home') }] }),
  staticData: { isAuth: true },
  getParentRoute: () => AppLayoutRoute,
  component: () => (
    <Suspense>
      <Home />
    </Suspense>
  ),
});

// We need an alias for '/' to forward users better if coming from backend
export const HomeAliasRoute = createRoute({
  path: '/home',
  validateSearch: z.object({
    invitationTokenId: z.string().optional(),
    invitationMembershipId: z.string().optional(),
    skipWelcome: z.boolean().optional(),
  }),
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Home') }] }),
  getParentRoute: () => AppLayoutRoute,
  onEnter: ({ search, cause }) => {
    // TODO this might cause a race condition (hence onEnter is used)
    if (cause !== 'enter' || search.skipWelcome) return;
    const { user } = useUserStore.getState();
    if (user.userFlags.finishedOnboarding) return;
    throw redirect({ to: '/welcome' });
  },
  component: () => (
    <Suspense>
      <Home />
    </Suspense>
  ),
});

export const WelcomeRoute = createRoute({
  path: '/welcome',
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Welcome') }] }),
  getParentRoute: () => AppLayoutRoute,
  onEnter: () => {
    // TODO this might cause a race condition (hence onEnter is used)
    const { user } = useUserStore.getState();
    if (user.userFlags.finishedOnboarding) throw redirect({ to: '/home' });
  },
  component: () => (
    <Suspense>
      <Welcome />
    </Suspense>
  ),
});
