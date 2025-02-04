import { createRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import Home from '~/modules/home';
import { AppRoute } from '~/routes/general';

const Welcome = lazy(() => import('~/modules/home/welcome'));

export const HomeRoute = createRoute({
  path: '/',
  staticData: { pageTitle: 'Home', isAuth: true },
  getParentRoute: () => AppRoute,
  component: () => <Home />,
});

// We need an alias for '/' to forward users better if coming from backend
export const HomeAliasRoute = createRoute({
  path: '/home',
  staticData: { pageTitle: 'Home', isAuth: true },
  getParentRoute: () => AppRoute,
  component: () => <Home />,
});

export const WelcomeRoute = createRoute({
  path: '/welcome',
  staticData: { pageTitle: 'Welcome', isAuth: true },
  getParentRoute: () => AppRoute,
  component: () => (
    <Suspense>
      <Welcome />
    </Suspense>
  ),
});
