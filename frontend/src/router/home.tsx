import { createRoute } from '@tanstack/react-router';
import Home from '~/modules/home';
import { IndexRoute } from './routeTree';

export const HomeRoute = createRoute({
  path: '/',
  beforeLoad: () => ({ getTitle: () => 'Home' }),
  getParentRoute: () => IndexRoute,
  component: () => <Home />,
});

// We need an alias for '/' to forward users better if coming from backend
export const HomeAliasRoute = createRoute({
  beforeLoad: () => ({ getTitle: () => 'Home' }),
  path: '/home',
  getParentRoute: () => IndexRoute,
  component: () => <Home />,
});
