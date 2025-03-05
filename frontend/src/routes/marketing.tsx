import { createRoute } from '@tanstack/react-router';
import About from '~/modules/marketing/about';
import Accessibility from '~/modules/marketing/accessibility';
import Contact from '~/modules/marketing/contact';
import { LegalMenu } from '~/modules/marketing/legal';
import { PublicRoute, rootRoute } from '~/routes/base';

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
  component: () => <LegalMenu />,
});

export const AccessibilityRoute = createRoute({
  path: '/accessibility',
  staticData: { pageTitle: 'Accessibility', isAuth: false },
  getParentRoute: () => rootRoute,
  component: () => <Accessibility />,
});
