import { createRoute } from '@tanstack/react-router';
import Home from '~/modules/home';
import Welcome from '~/modules/home/welcome';
import { IndexRoute } from './routeTree';

export const HomeRoute = createRoute({
  path: '/',
  staticData: { pageTitle: 'Home' },
  getParentRoute: () => IndexRoute,
  component: () => <Home />,
});

// We need an alias for '/' to forward users better if coming from backend
export const HomeAliasRoute = createRoute({
  path: '/home',
  staticData: { pageTitle: 'Home' },
  getParentRoute: () => IndexRoute,
  component: () => <Home />,
});

export const WelcomeRoute = createRoute({
  path: '/welcome',
  staticData: { pageTitle: 'Welcome' },
  getParentRoute: () => IndexRoute,
  component: () => <Welcome />,
});


