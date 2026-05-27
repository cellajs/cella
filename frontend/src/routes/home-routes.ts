import { createRoute } from '@tanstack/react-router';
import { lazy } from 'react';
import { z } from 'zod';
import { HomePage } from '~/modules/home/home-page';
import { useUserStore } from '~/modules/user/user-store';
import { AppLayoutRoute } from '~/routes/base-routes';
import { withSuspense } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';

// Dynamic import to avoid circular dependency: router -> route-tree -> home-routes
const navigate = (to: '/home' | '/welcome', replace = true) => {
  void import('~/routes/router').then(({ default: router }) => {
    router.navigate({ to, replace, ignoreBlocker: true });
  });
};

const WelcomePage = lazy(() => import('~/modules/home/welcome-page'));

/**
 * Main home page for authenticated users.
 */
export const HomeRoute = createRoute({
  path: '/',
  head: () => ({ meta: [{ title: appTitle('Home') }] }),
  staticData: { isAuth: true },
  getParentRoute: () => AppLayoutRoute,
  onEnter: ({ cause }) => {
    if (cause !== 'enter') return;
    const { user } = useUserStore.getState();
    if (!user) return;
    if (!user.userFlags.finishedOnboarding) navigate('/welcome');
  },
  component: withSuspense(HomePage),
});
export const HomeAliasRoute = createRoute({
  path: '/home',
  validateSearch: z.object({
    skipWelcome: z.boolean().optional(),
  }),
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Home') }] }),
  getParentRoute: () => AppLayoutRoute,
  onEnter: ({ search, cause }) => {
    // onEnter used instead of beforeLoad: user store may not be populated yet during beforeLoad
    if (cause !== 'enter' || search.skipWelcome) return;
    const { user } = useUserStore.getState();
    if (!user || user.userFlags.finishedOnboarding) return;
    navigate('/welcome');
  },
  component: withSuspense(HomePage),
});

/**
 * Welcome page shown to new users during onboarding.
 */
export const WelcomeRoute = createRoute({
  path: '/welcome',
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Welcome') }] }),
  getParentRoute: () => AppLayoutRoute,
  onEnter: () => {
    // onEnter used instead of beforeLoad: user store may not be populated yet during beforeLoad
    const { user } = useUserStore.getState();
    if (!user) return;
    if (user.userFlags.finishedOnboarding) navigate('/home');
  },
  component: withSuspense(WelcomePage),
});
