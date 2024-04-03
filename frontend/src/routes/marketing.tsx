import { createRoute } from '@tanstack/react-router';
import About from '~/modules/marketing/about';
import Accessibility from '~/modules/marketing/accessibility';
import Contact from '~/modules/marketing/contact';
import { Privacy } from '~/modules/marketing/privacy';
import { Terms } from '~/modules/marketing/terms';
import { rootRoute } from './routeTree';

export const AboutRoute = createRoute({
  path: '/about',
  beforeLoad: () => ({ getTitle: () => 'About' }),
  getParentRoute: () => rootRoute,
  component: () => <About />,
});

export const ContactRoute = createRoute({
  path: '/contact',
  beforeLoad: () => ({ getTitle: () => 'Contact' }),
  getParentRoute: () => rootRoute,
  component: () => <Contact />,
});

export const TermsRoute = createRoute({
  path: '/terms',
  beforeLoad: () => ({ getTitle: () => 'Terms' }),
  getParentRoute: () => rootRoute,
  component: () => <Terms />,
});

export const PrivacyRoute = createRoute({
  path: '/privacy',
  beforeLoad: () => ({ getTitle: () => 'Privacy' }),
  getParentRoute: () => rootRoute,
  component: () => <Privacy />,
});

export const AccessibilityRoute = createRoute({
  path: '/accessibility',
  beforeLoad: () => ({ getTitle: () => 'Accessibility' }),
  getParentRoute: () => rootRoute,
  component: () => <Accessibility />,
});
