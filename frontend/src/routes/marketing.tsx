import { createRoute } from '@tanstack/react-router';
import About from '~/modules/marketing/about';
import Accessibility from '~/modules/marketing/accessibility';
import Contact from '~/modules/marketing/contact';
import { LegalsMenu } from '~/modules/marketing/legals';
import { rootRoute } from './general';

export const AboutRoute = createRoute({
  path: '/about',
  staticData: { pageTitle: 'About', isAuth: false },
  getParentRoute: () => rootRoute,
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

export const AccessibilityRoute = createRoute({
  path: '/accessibility',
  staticData: { pageTitle: 'Accessibility', isAuth: false },
  getParentRoute: () => rootRoute,
  component: () => <Accessibility />,
});
