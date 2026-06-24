import {
  Building2Icon,
  CloudIcon,
  Code2Icon,
  DatabaseIcon,
  GaugeIcon,
  KeyRoundIcon,
  type LucideIcon,
  RefreshCwIcon,
  RocketIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
} from 'lucide-react';
import { appConfig, type EntityType } from 'shared';
import { nanoid } from 'shared/nanoid';
import type { InfoCard } from '~/modules/marketing/about/info-cards';
import type { PricingPlan } from '~/modules/marketing/about/pricing';
import type { ShowcaseItem } from '~/modules/marketing/about/showcase';
import { ElementIcon } from '~/modules/marketing/icons/element';
import { GithubIcon } from '~/modules/marketing/icons/github';

/*************************************************************************************************
 * Nav
 ************************************************************************************************/

export const marketingNavConfig = [
  { id: 'features', url: '/features', hash: '' },
  // { id: 'pricing', url: '/about', hash: 'pricing' },
  { id: 'docs', url: '/docs', hash: '' },
];

/*************************************************************************************************
 * Footer
 ************************************************************************************************/

export const socials = [
  { title: 'Social', href: appConfig.company.socialUrl, icon: CloudIcon },
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
 * About - Stack (tech-stack tile grid on /about)
 ************************************************************************************************/

export const stackItems = [
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
 * Features page — categorised capability list (/features)
 *
 * Categories (suggested):
 *   sync        Sync, realtime & offline
 *   security    Security & multi-tenancy
 *   auth        Authentication
 *   dx          Developer experience
 *   deploy      Deployment & infrastructure
 *   performance Performance & observability
 *   data        Data modelling
 *
 * Each item maps to translation keys:
 *   features:<category>.<id>_title
 *   features:<category>.<id>_text
 ************************************************************************************************/

export type FeatureCategory = 'sync' | 'security' | 'auth' | 'ux' | 'dx' | 'deploy' | 'performance' | 'data';

export const featureCategoryIcons = {
  sync: RefreshCwIcon,
  security: ShieldCheckIcon,
  auth: KeyRoundIcon,
  ux: SparklesIcon,
  dx: Code2Icon,
  deploy: RocketIcon,
  performance: GaugeIcon,
  data: DatabaseIcon,
} as const satisfies Record<FeatureCategory, LucideIcon>;

export type FeaturesPageItem = {
  id: string;
  category: FeatureCategory;
};

export const featuresPageItems: FeaturesPageItem[] = [
  // Data modelling
  { id: 'entity_hierarchy', category: 'data' },
  { id: 'context_entities', category: 'data' },
  { id: 'product_entities', category: 'data' },
  { id: 'schema_evolution', category: 'data' },
  { id: 'user', category: 'data' },
  { id: 'organization', category: 'data' },
  // Optional built-in product entities (can be removed in forks)
  { id: 'attachment', category: 'data' },
  { id: 'page', category: 'data' },

  // Sync, realtime & offline
  { id: 'notify_then_fetch', category: 'sync' },
  { id: 'offline_queue', category: 'sync' },
  { id: 'yjs_collaboration', category: 'sync' },
  { id: 'gap_detection', category: 'sync' },
  { id: 'per_field_merge', category: 'sync' },
  { id: 'multi_tab', category: 'sync' },
  { id: 'public_private', category: 'sync' },
  { id: 'cache_integrity', category: 'sync' },
  { id: 'embedded_propagation', category: 'sync' },
  { id: 'create_edit_coalescing', category: 'sync' },
  { id: 'idempotent_mutations', category: 'sync' },
  { id: 'sync_stale_time', category: 'sync' },
  { id: 'cache_persistence', category: 'sync' },
  { id: 'activity_bus', category: 'sync' },
  { id: 'seen_unseen', category: 'sync' },

  // Security & multi-tenancy
  { id: 'rls', category: 'security' },
  { id: 'rls_read_write', category: 'security' },
  { id: 'guard_chain', category: 'security' },
  { id: 'tenant_isolation', category: 'security' },
  { id: 'permission_manager', category: 'security' },
  { id: 'immutability', category: 'security' },

  // Authentication
  { id: 'magic_link', category: 'auth' },
  { id: 'passkey', category: 'auth' },
  { id: 'oauth', category: 'auth' },
  { id: 'totp', category: 'auth' },
  { id: 'mfa', category: 'auth' },
  { id: 'session_management', category: 'auth' },
  { id: 'impersonation', category: 'auth' },
  { id: 'rate_limiting', category: 'auth' },

  // UI & UX
  { id: 'responsive', category: 'ux' },
  { id: 'pwa', category: 'ux' },
  { id: 'i18n', category: 'ux' },
  { id: 'data_grid', category: 'ux' },
  { id: 'blocknote_editor', category: 'ux' },
  { id: 'resizable_panels', category: 'ux' },
  { id: 'drawer_patterns', category: 'ux' },
  { id: 'storybook', category: 'ux' },

  // Developer experience
  { id: 'openapi_sdk', category: 'dx' },
  { id: 'autogenerated_docs', category: 'dx' },
  { id: 'openapi_extensions', category: 'dx' },
  { id: 'canonical_queries', category: 'dx' },
  { id: 'mock_generators', category: 'dx' },
  { id: 'file_based_routing', category: 'dx' },
  { id: 'cella_cli', category: 'dx' },
  { id: 'drizzle_orm', category: 'dx' },
  { id: 'email_templates', category: 'dx' },

  // Deployment & infrastructure
  { id: 'pulumi_iac', category: 'deploy' },
  { id: 'docker', category: 'deploy' },
  { id: 'eu_cloud', category: 'deploy' },
  { id: 'github_actions', category: 'deploy' },
  { id: 'zero_downtime', category: 'deploy' },

  // Performance & observability
  { id: 'otel', category: 'performance' },
  { id: 'load_testing', category: 'performance' },
  { id: 'ttl_cache', category: 'performance' },
  { id: 'cache_token', category: 'performance' },
  { id: 'unified_counts', category: 'performance' },
  { id: 'cdc_batching', category: 'performance' },
];

/*************************************************************************************************
 * About - Cards
 ************************************************************************************************/

export const cards: InfoCard[] = [
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
    url: 'https://www.raak.dev',
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
