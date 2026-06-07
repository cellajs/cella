import { Building2Icon, CloudIcon, type LucideIcon, UsersIcon } from 'lucide-react';
import { appConfig, type EntityType } from 'shared';
import { nanoid } from 'shared/nanoid';
import type { AboutCard } from '~/modules/marketing/about/cards';
import type { PricingPlan } from '~/modules/marketing/about/pricing';
import type { ShowcaseItem } from '~/modules/marketing/about/showcase';
import { ElementIcon } from '~/modules/marketing/icons/element';
import { GithubIcon } from '~/modules/marketing/icons/github';

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
    title: 'c:product',
    links: [
      { title: 'c:about', href: '/about' },
      { title: 'c:sign_up', href: '/auth/authenticate' },
    ],
  },
  {
    title: 'c:documentation',
    hideOnMobile: true,
    links: [
      { title: 'c:api_docs', href: '/docs' },
      { title: 'c:architecture', href: 'https://github.com/cellajs/cella/blob/main/info/ARCHITECTURE.md' },
      { title: 'c:roadmap', href: 'https://github.com/cellajs/cella/blob/main/info/ROADMAP.md' },
    ],
  },
  {
    title: 'c:connect',
    links: [{ title: 'c:contact_us', href: '/contact' }, ...socials],
  },
];

/*************************************************************************************************
 * Legal
 ************************************************************************************************/

export const legalLinks = [
  { title: 'c:legal', href: '/legal' },
  { title: 'c:accessibility', href: '/accessibility' },
];

/*************************************************************************************************
 * About - Features
 ************************************************************************************************/

export const features = [
  { id: 'hono' },
  { id: 'react' },
  { id: 'drizzle' },
  { id: 'baseui' },
  { id: 'openapi' },
  { id: 'vite' },
  { id: 'yjs' },
  { id: 'pulumi' },
  { id: 'artillery' },
];

/*************************************************************************************************
 * About - Cards
 ************************************************************************************************/

export const cards: AboutCard[] = [
  { name: 'Transloadit', country: 'DE', url: 'transloadit.com', id: 'transloadit' },
  { name: 'BlockNote', country: 'NL', url: 'blocknotejs.org', id: 'blocknote' },
  { name: 'Scaleway', country: 'FR', url: 'scaleway.com', id: 'scaleway' },
  { name: 'One dollar stats', country: 'UA', url: 'onedollarstats.com', id: 'onedollarstats' },
  { name: 'Brevo', country: 'FR', url: 'brevo.com', id: 'brevo' },
  { name: 'Matrix', country: 'GB', url: 'matrix.org', id: 'matrix', invert: true },
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
  { id: 'user', title: 'c:users', icon: UsersIcon },
  { id: 'organization', title: 'c:organizations', icon: Building2Icon },
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
