import { createRoute, redirect } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import Home from '~/modules/home';
import { AppRoute } from '~/routes/base';
import { useNavigationStore } from '~/store/navigation';

const Welcome = lazy(() => import('~/modules/home/welcome-page'));

export const HomeRoute = createRoute({
  path: '/',
  staticData: { isAuth: true },
  getParentRoute: () => AppRoute,
  component: () => <Home />,
});

// We need an alias for '/' to forward users better if coming from backend
export const HomeAliasRoute = createRoute({
  path: '/home',
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: 'Home' }] }),
  getParentRoute: () => AppRoute,
  component: () => <Home />,
});

export const WelcomeRoute = createRoute({
  path: '/welcome',
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: 'Welcome' }] }),
  getParentRoute: () => AppRoute,
  beforeLoad: ({ cause }) => {
    if (cause !== 'enter') return;
    const finishedOnboarding = useNavigationStore.getState().finishedOnboarding;
    if (finishedOnboarding) throw redirect({ to: '/home' });
  },
  component: () => (
    <Suspense>
      <Welcome />
    </Suspense>
  ),
});
