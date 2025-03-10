import { config } from 'config';
import { Building2, Cloud, Github, Users } from 'lucide-react';

/*************************************************************************************************
 * Nav
 ************************************************************************************************/

export const marketingNavConfig = [
  { id: 'features', url: '/about', hash: 'features' },
  // { id: 'pricing', url: '/about', hash: 'pricing' },
  { id: 'docs', url: `${config.backendUrl}/docs`, hash: '' },
];

/*************************************************************************************************
 * Footer
 ************************************************************************************************/

export const socials = [
  { title: 'BlueSky', href: config.company.blueskyUrl, icon: Cloud },
  { title: 'GitHub', href: config.company.githubUrl, icon: Github },
];

export const footerSections = [
  {
    title: 'common:product',
    links: [
      { title: 'common:about', href: '/about' },
      { title: 'common:sign_up', href: '/auth/authenticate' },
    ],
  },
  {
    title: 'common:documentation',
    hideOnMobile: true,
    links: [
      { title: 'common:api_docs', href: `${config.backendUrl}/docs` },
      { title: 'common:architecture', href: 'https://github.com/cellajs/cella/blob/main/info/ARCHITECTURE.md' },
      { title: 'common:roadmap', href: 'https://github.com/cellajs/cella/blob/main/info/ROADMAP.md' },
    ],
  },
  {
    title: 'common:connect',
    links: [{ title: 'common:contact_us', href: '/contact' }, ...socials],
  },
];

/*************************************************************************************************
 * Legal
 ************************************************************************************************/

export const legalLinks = [
  { title: 'common:legal', href: '/legal' },
  { title: 'common:accessibility', href: '/accessibility' },
];

/*************************************************************************************************
 * About - Features
 ************************************************************************************************/

export const features = [
  { icon: 'hono' },
  { icon: 'react' },
  { icon: 'drizzle' },
  { icon: 'shadcn' },
  { icon: 'openapi' },
  { icon: 'vite' },
  { icon: 'tanstack' },
  { icon: 'electric' },
];

/*************************************************************************************************
 * About - Pricing plan
 ************************************************************************************************/

interface PricingPlan {
  id: string;
  action: 'sign_in' | 'contact_us' | 'waitlist_request';
  priceId: string | null;
  featureCount: number;
  borderColor: string;
  popular?: boolean;
  discount?: string;
}

export const pricingPlans: PricingPlan[] = [
  { id: 'donate', action: 'contact_us', priceId: null, featureCount: 5, borderColor: '' },
  { id: 'build', action: 'waitlist_request', priceId: null, featureCount: 4, borderColor: 'ring-4 ring-primary/5', popular: true },
  { id: 'partner', action: 'contact_us', priceId: null, featureCount: 3, borderColor: '' },
];

/*************************************************************************************************
 * About - FAQ
 ************************************************************************************************/

export const faqsData = [
  { id: 'production-ready', link: config.company.githubUrl },
  { id: 'cella-vs-next' },
  { id: 'alternative-to-nextjs' },
  { id: 'cella-made-in-europe' },
];

/*************************************************************************************************
 * About - Counters
 ************************************************************************************************/

export const counts = [
  { id: 'users', title: 'common:users', icon: Users },
  { id: 'organizations', title: 'common:organizations', icon: Building2 },
] as const;

/*************************************************************************************************
 * About - Why
 ************************************************************************************************/

export const whyItems = [{ id: 'implementation-ready' }, { id: 'prebuilt-endpoints' }, { id: 'dedicated-community' }];

export const whyLightSlides = [
  { url: '/static/screenshots/system-page.png', name: 'System page', filename: 'system-page.png', contentType: 'image/png' },
  { url: '/static/screenshots/org-page.png', name: 'Organization page', filename: 'org-page.png', contentType: 'image/png' },
  { url: '/static/screenshots/settings.png', name: 'User settings page', filename: 'settings.png', contentType: 'image/png' },
];
export const whyDarkSlides = [
  { url: '/static/screenshots/system-page-dark.png', name: 'System page', filename: 'system-page-dark.png', contentType: 'image/png' },
  { url: '/static/screenshots/org-page-dark.png', name: 'Organization page', filename: 'org-page-dark.png', contentType: 'image/png' },
  { url: '/static/screenshots/settings-dark.png', name: 'User settings page', filename: 'settings-dark.png', contentType: 'image/png' },
];
