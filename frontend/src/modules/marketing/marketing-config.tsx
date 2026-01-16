import { appConfig, type EntityType } from 'config';
import { Building2Icon, CloudIcon, type LucideIcon, UsersIcon } from 'lucide-react';
import type { AboutCard } from '~/modules/marketing/about/cards';
import type { PricingPlan } from '~/modules/marketing/about/pricing';
import { ShowcaseItem } from '~/modules/marketing/about/showcase';
import { ElementIcon } from '~/modules/marketing/icons/element';
import { GithubIcon } from '~/modules/marketing/icons/github';
import { nanoid } from '~/utils/nanoid';

/*************************************************************************************************
 * Nav
 ************************************************************************************************/

export const marketingNavConfig = [
  { id: 'features', url: '/about', hash: 'features' },
  // { id: 'pricing', url: '/about', hash: 'pricing' },
  { id: 'docs', url: '/docs', hash: '' },
];

/*************************************************************************************************
 * Footer
 ************************************************************************************************/

export const socials = [
  { title: 'BlueSky', href: appConfig.company.blueskyUrl, icon: CloudIcon },
  { title: 'Element', href: appConfig.company.element, icon: ElementIcon },
  { title: 'GitHub', href: appConfig.company.githubUrl, icon: GithubIcon },
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
      { title: 'common:api_docs', href: `${appConfig.backendUrl}/docs` },
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
  { id: 'hono' },
  { id: 'vite' },
  { id: 'react' },
  { id: 'drizzle' },
  { id: 'electric' },
  { id: 'shadcn' },
  { id: 'openapi' },
  { id: 'tanstack' },
];

/*************************************************************************************************
 * About - Cards
 ************************************************************************************************/

export const cards: AboutCard[] = [
  { name: 'Transloadit', country: 'DE', url: 'transloadit.com', id: 'transloadit' },
  { name: 'One dollar stats', country: 'UA', url: 'onedollarstats.com', id: 'onedollarstats' },
  { name: 'BlockNote', country: 'NL', url: 'blocknotejs.org', id: 'blocknote' },
  { name: 'Brevo', country: 'FR', url: 'brevo.com', id: 'brevo' },
  { name: 'Matrix', country: 'GB', url: 'matrix.org', id: 'matrix', invert: true },
  { name: 'Sentry', country: 'US', url: 'sentry.io', id: 'sentry' },
  { name: 'Paddle', country: 'GB', url: 'paddle.com', id: 'paddle' },
  { name: 'Gleap', country: 'AT', url: 'gleap.io', id: 'gleap' },
];

/*************************************************************************************************
 * About - Pricing plan
 ************************************************************************************************/

export const pricingPlans: PricingPlan[] = [
  { id: 'donate', action: 'contact_us', priceId: null, featureCount: 5, borderColor: '' },
  {
    id: 'build',
    action: 'waitlist_request',
    priceId: null,
    featureCount: 4,
    borderColor: 'ring-4 ring-primary/5',
    popular: true,
  },
  { id: 'partner', action: 'contact_us', priceId: null, featureCount: 3, borderColor: '' },
];

/*************************************************************************************************
 * About - FAQ
 ************************************************************************************************/

export const faqsData = [
  { id: 'production-ready', link: appConfig.company.githubUrl },
  { id: 'cella-vs-next' },
  { id: 'alternative-to-nextjs' },
  { id: 'cella-made-in-europe' },
];

/*************************************************************************************************
 * About - Counters
 ************************************************************************************************/

export const counts = [
  { id: 'user', title: 'common:users', icon: UsersIcon },
  { id: 'organization', title: 'common:organizations', icon: Building2Icon },
] as const satisfies readonly { id: EntityType; title: string; icon: LucideIcon }[];

/*************************************************************************************************
 * About - Why
 ************************************************************************************************/

export const whyItems = [{ id: 'implementation-ready' }, { id: 'prebuilt-endpoints' }, { id: 'dedicated-community' }];

export const whyLightSlides = [
  {
    id: nanoid(),
    url: '/static/screenshots/system-page.png',
    name: 'System page',
    filename: 'system-page.png',
    contentType: 'image/png',
  },
  {
    id: nanoid(),
    url: '/static/screenshots/org-page.png',
    name: 'Organization page',
    filename: 'org-page.png',
    contentType: 'image/png',
  },
  {
    id: nanoid(),
    url: '/static/screenshots/settings.png',
    name: 'User settings page',
    filename: 'settings.png',
    contentType: 'image/png',
  },
];
export const whyDarkSlides = [
  {
    id: nanoid(),
    url: '/static/screenshots/system-page-dark.png',
    name: 'System page',
    filename: 'system-page-dark.png',
    contentType: 'image/png',
  },
  {
    id: nanoid(),
    url: '/static/screenshots/org-page-dark.png',
    name: 'Organization page',
    filename: 'org-page-dark.png',
    contentType: 'image/png',
  },
  {
    id: nanoid(),
    url: '/static/screenshots/settings-dark.png',
    name: 'User settings page',
    filename: 'settings-dark.png',
    contentType: 'image/png',
  },
];

/*************************************************************************************************
 * About - Showcase
 ************************************************************************************************/

export const showcaseItems: ShowcaseItem[] = [
  {
    id: 'raak',
    url: 'https://raak.dev',
    lightItems: [
      { id: nanoid(), url: '/static/images/showcases/raak-1.png', contentType: 'image/png' },
      { id: nanoid(), url: '/static/images/showcases/raak-2.png', contentType: 'image/png' },
    ],
    darkItems: [
      { id: nanoid(), url: '/static/images/showcases/raak-1-dark.png', contentType: 'image/png' },
      { id: nanoid(), url: '/static/images/showcases/raak-2-dark.png', contentType: 'image/png' },
    ],
  },
];
