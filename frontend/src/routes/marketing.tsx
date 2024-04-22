import { createRoute } from '@tanstack/react-router';
import About from '~/modules/marketing/about';
import Accessibility from '~/modules/marketing/accessibility';
import Contact from '~/modules/marketing/contact';
import { LegalsMenu } from '~/modules/marketing/legals';
import { rootRoute } from './routeTree';

export const AboutRoute = createRoute({
  path: '/about',
  staticData: { pageTitle: 'About' },
  getParentRoute: () => rootRoute,
  component: () => <About />,
});

export const ContactRoute = createRoute({
  path: '/contact',
  staticData: { pageTitle: 'Contact' },
  getParentRoute: () => rootRoute,
  component: () => <Contact />,
});

export const LegalRoute = createRoute({
  path: '/legal',
  staticData: { pageTitle: 'Legal' },
  getParentRoute: () => rootRoute,
  component: () => <LegalsMenu />,
});

export const AccessibilityRoute = createRoute({
  path: '/accessibility',
  staticData: { pageTitle: 'Accessibility' },
  getParentRoute: () => rootRoute,
  component: () => <Accessibility />,
});
