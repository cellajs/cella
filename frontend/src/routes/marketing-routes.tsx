import { createRoute } from '@tanstack/react-router';
import AboutPage from '~/modules/marketing/about/about-page';
import AccessibilityPage from '~/modules/marketing/accessibility-page';
import ContactPage from '~/modules/marketing/contact-page';
import { LegalPage } from '~/modules/marketing/legal-page';
import { PublicRoute, rootRoute } from '~/routes/base-routes';
import appTitle from '~/utils/app-title';

export const AboutRoute = createRoute({
  path: '/about',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('About') }] }),
  getParentRoute: () => PublicRoute,
  component: () => <AboutPage />,
});

export const ContactRoute = createRoute({
  path: '/contact',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Contact') }] }),
  getParentRoute: () => rootRoute,
  component: () => <ContactPage />,
});

export const LegalRoute = createRoute({
  path: '/legal',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Legal') }] }),
  getParentRoute: () => rootRoute,
  component: () => <LegalPage />,
});

export const AccessibilityRoute = createRoute({
  path: '/accessibility',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Accessibility') }] }),
  getParentRoute: () => rootRoute,
  component: () => <AccessibilityPage />,
});
