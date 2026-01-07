import { createRoute, redirect } from '@tanstack/react-router';
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
const defaultLegalSubject = legalSubjects[0];

// Redirect /legal to /legal/privacy (or first subject)
export const LegalIndexRoute = createRoute({
  path: '/legal',
  staticData: { isAuth: false },
  getParentRoute: () => RootRoute,
  beforeLoad: () => {
    throw redirect({ to: '/legal/$subject', params: { subject: defaultLegalSubject } });
  },
});

export const LegalRoute = createRoute({
  path: '/legal/$subject',
  params: {
    parse: (params) => ({
      subject: z.enum(legalSubjects).catch(defaultLegalSubject).parse(params.subject),
    }),
    stringify: (params) => ({ subject: params.subject }),
  },
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
