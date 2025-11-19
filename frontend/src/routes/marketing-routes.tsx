import { createRoute } from '@tanstack/react-router';
import z from 'zod';
import AboutPage from '~/modules/marketing/about/about-page';
import AccessibilityPage from '~/modules/marketing/accessibility-page';
import ContactPage from '~/modules/marketing/contact-page';
import { legalConfig } from '~/modules/marketing/legal/legal-config';
import { LegalPage } from '~/modules/marketing/legal/legal-page';
import { PublicLayoutRoute, RootRoute } from '~/routes/base-routes';
import appTitle from '~/utils/app-title';
import { objectEntries } from '~/utils/object';

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

const legalSubjects = objectEntries(legalConfig).map(([subject]) => subject);

export const LegalRoute = createRoute({
  path: '/legal',
  validateSearch: z.object({
    tab: z.enum(legalSubjects).optional(),
  }),
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
