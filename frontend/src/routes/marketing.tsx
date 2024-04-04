import { createRoute } from '@tanstack/react-router';
import About from '~/modules/marketing/about';
import Accessibility from '~/modules/marketing/accessibility';
import Contact from '~/modules/marketing/contact';
import { Privacy } from '~/modules/marketing/privacy';
import { Terms } from '~/modules/marketing/terms';
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

export const TermsRoute = createRoute({
  path: '/terms',
  staticData: { pageTitle: 'Terms' },
  getParentRoute: () => rootRoute,
  component: () => <Terms />,
});

export const PrivacyRoute = createRoute({
  path: '/privacy',
  staticData: { pageTitle: 'Privacy' },
  getParentRoute: () => rootRoute,
  component: () => <Privacy />,
});

export const AccessibilityRoute = createRoute({
  path: '/accessibility',
  staticData: { pageTitle: 'Accessibility' },
  getParentRoute: () => rootRoute,
  component: () => <Accessibility />,
});
