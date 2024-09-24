import { createRoute } from '@tanstack/react-router';
import About from '~/modules/marketing/about';
import Contact from '~/modules/marketing/contact';
import { LegalsMenu } from '~/modules/marketing/legals';
import { PublicRoute, rootRoute } from './general';

export const AboutRoute = createRoute({
  path: '/about',
  staticData: { pageTitle: 'About', isAuth: false },
  getParentRoute: () => PublicRoute,
  component: () => <About />,
});

export const ContactRoute = createRoute({
  path: '/contact',
  staticData: { pageTitle: 'Contact', isAuth: false },
  getParentRoute: () => rootRoute,
  component: () => <Contact />,
});

export const LegalRoute = createRoute({
  path: '/legal',
  staticData: { pageTitle: 'Legal', isAuth: false },
  getParentRoute: () => rootRoute,
  component: () => <LegalsMenu />,
});
