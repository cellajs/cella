import { createRoute } from '@tanstack/react-router';
import AboutPage from '~/modules/marketing/about/about-page';
import AccessibilityPage from '~/modules/marketing/accessibility-page';
import ContactPage from '~/modules/marketing/contact-page';
import { LegalPage } from '~/modules/marketing/legal-page';
import { PublicLayoutRoute, RootRoute } from '~/routes/base-routes';
import appTitle from '~/utils/app-title';

export const AboutRoute = createRoute({
  path: '/about',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('About') }] }),
  getParentRoute: () => PublicLayoutRoute,
  component: () => <AboutPage />,
});

export const ContactRoute = createRoute({
  path: '/contact',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Contact') }] }),
  getParentRoute: () => RootRoute,
  component: () => <ContactPage />,
});

export const LegalRoute = createRoute({
  path: '/legal',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Legal') }] }),
  getParentRoute: () => RootRoute,
  component: () => <LegalPage />,
});

export const AccessibilityRoute = createRoute({
  path: '/accessibility',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Accessibility') }] }),
  getParentRoute: () => RootRoute,
  component: () => <AccessibilityPage />,
});
