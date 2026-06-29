import {
  Building2Icon,
  CheckCheckIcon,
  CloudIcon,
  Code2Icon,
  DatabaseIcon,
  GaugeIcon,
  HeartPulseIcon,
  KeyRoundIcon,
  type LucideIcon,
  RadioTowerIcon,
  RocketIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
  WifiOffIcon,
} from 'lucide-react';
import { appConfig, type EntityType } from 'shared';
import { nanoid } from 'shared/nanoid';
import { ElementIcon } from '~/modules/common/icons/element';
import { GithubIcon } from '~/modules/common/icons/github';
import type { InfoCard } from '~/modules/marketing/about/info-cards';
import type { PricingPlan } from '~/modules/marketing/about/pricing';
import type { ShowcaseItem } from '~/modules/marketing/about/showcase';

/*************************************************************************************************
 * Nav
 ************************************************************************************************/

export const marketingNavConfig = [
  { id: 'features', url: '/features', hash: '' },
  { id: 'sync_engine', url: '/sync-engine', hash: '' },
  // { id: 'pricing', url: '/about', hash: 'pricing' },
  { id: 'docs', url: '/docs', hash: '' },
];

/*************************************************************************************************
 * Footer
 ************************************************************************************************/

export const socials = [
  { title: 'Social', href: appConfig.company.socialUrl, icon: CloudIcon },
  { title: 'Chat', href: appConfig.company.element, icon: ElementIcon },
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
 *   about:features.<id>
 *   about:features.<id>.text
 ************************************************************************************************/

export type FeatureCategory = 'security' | 'auth' | 'ux' | 'dx' | 'deploy' | 'performance' | 'data';

export const featureCategoryIcons = {
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
  { id: 'explicit_routes', category: 'data' },
  { id: 'entity_hierarchy', category: 'data' },
  { id: 'context_entities', category: 'data' },
  { id: 'product_entities', category: 'data' },
  { id: 'schema_evolution', category: 'data' },
  { id: 'user', category: 'data' },
  { id: 'organization', category: 'data' },
  // Optional built-in product entities (can be removed in forks)
  { id: 'attachment', category: 'data' },
  { id: 'page', category: 'data' },

  // Security & multi-tenancy
  { id: 'tenant_isolation', category: 'security' },
  { id: 'permission_manager', category: 'security' },
  { id: 'guard_chain', category: 'security' },
  { id: 'rls', category: 'security' },
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
  { id: 'ui_components', category: 'ux' },
  { id: 'pwa', category: 'ux' },
  { id: 'i18n', category: 'ux' },
  { id: 'data_grid', category: 'ux' },
  { id: 'blocknote_editor', category: 'ux' },
  { id: 'resizable_panels', category: 'ux' },
  { id: 'storybook', category: 'ux' },

  // Developer experience
  { id: 'cella_cli', category: 'dx' },
  { id: 'openapi_sdk', category: 'dx' },
  { id: 'autogenerated_docs', category: 'dx' },
  { id: 'openapi_extensions', category: 'dx' },
  { id: 'mock_generators', category: 'dx' },
  { id: 'file_based_routing', category: 'dx' },
  { id: 'drizzle_orm', category: 'dx' },
  { id: 'vitest', category: 'dx' },
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
];

/*************************************************************************************************
 * Sync engine — categorised capability list (/sync-engine)
 *
 * Kept separate from featuresPageItems so the sync engine page can group its
 * many capabilities into readable sub-categories.
 *
 * Each item maps to translation keys:
 *   about:features.<id>
 *   about:features.<id>.text
 * Each category maps to:
 *   about:features.category_<category>
 *
 * `layers` tags which part of the stack a capability lives in (client, api,
 * cdc, yjs), rendered as badges after the title so it's clear where each
 * feature runs. Multiple layers means the capability spans them.
 ************************************************************************************************/

export type SyncCategory = 'realtime' | 'offline' | 'consistency' | 'resilience';

export const syncCategoryIcons = {
  realtime: RadioTowerIcon,
  offline: WifiOffIcon,
  consistency: CheckCheckIcon,
  resilience: HeartPulseIcon,
} as const satisfies Record<SyncCategory, LucideIcon>;

export type SyncLayer = 'client' | 'api' | 'cdc' | 'yjs';

export type SyncPageItem = {
  id: string;
  category: SyncCategory;
  layers: SyncLayer[];
};

export const syncPageItems: SyncPageItem[] = [
  // Realtime & collaboration
  { id: 'notify_then_fetch', category: 'realtime', layers: ['cdc', 'api', 'client'] },
  { id: 'yjs_collaboration', category: 'realtime', layers: ['yjs', 'client'] },
  { id: 'embedded_propagation', category: 'realtime', layers: ['client'] },
  { id: 'multi_tab', category: 'realtime', layers: ['client'] },
  { id: 'public_private', category: 'realtime', layers: ['api', 'client'] },
  { id: 'cdc_batching', category: 'realtime', layers: ['cdc'] },
  { id: 'activity_bus', category: 'realtime', layers: ['api'] },
  { id: 'seen_unseen', category: 'realtime', layers: ['api', 'client'] },
  { id: 'unified_counts', category: 'realtime', layers: ['cdc', 'api'] },

  // Offline & local-first
  { id: 'offline_queue', category: 'offline', layers: ['client'] },
  { id: 'cache_persistence', category: 'offline', layers: ['client'] },
  { id: 'create_edit_coalescing', category: 'offline', layers: ['client'] },
  { id: 'idempotent_mutations', category: 'offline', layers: ['client', 'api'] },

  // Consistency & freshness
  { id: 'gap_detection', category: 'consistency', layers: ['client', 'api'] },
  { id: 'soft_delete', category: 'consistency', layers: ['api', 'cdc'] },
  { id: 'per_field_merge', category: 'consistency', layers: ['api'] },
  { id: 'text_merge', category: 'consistency', layers: ['yjs'] },
  { id: 'canonical_queries', category: 'consistency', layers: ['client'] },
  { id: 'cache_integrity', category: 'consistency', layers: ['client', 'api'] },
  { id: 'cache_token', category: 'consistency', layers: ['cdc', 'api'] },
  { id: 'ttl_cache', category: 'consistency', layers: ['api'] },

  // Resilience & graceful degradation
  { id: 'rest_fallback', category: 'resilience', layers: ['client'] },
  { id: 'stream_reconnect', category: 'resilience', layers: ['client'] },
  { id: 'at_least_once', category: 'resilience', layers: ['cdc'] },
  { id: 'circuit_breaker', category: 'resilience', layers: ['cdc'] },
  { id: 'transient_retry', category: 'resilience', layers: ['cdc'] },
  { id: 'catchup_recovery', category: 'resilience', layers: ['cdc', 'api'] },
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
    url: '/static/marketing/screenshots/system-page.png',
    name: 'System page',
    filename: 'system-page.png',
    contentType: 'image/png',
  },
  {
    id: nanoid(),
    url: '/static/marketing/screenshots/org-page.png',
    name: 'Organization page',
    filename: 'org-page.png',
    contentType: 'image/png',
  },
  {
    id: nanoid(),
    url: '/static/marketing/screenshots/settings.png',
    name: 'User settings page',
    filename: 'settings.png',
    contentType: 'image/png',
  },
];
export const whyDarkSlides = [
  {
    id: nanoid(),
    url: '/static/marketing/screenshots/system-page-dark.png',
    name: 'System page',
    filename: 'system-page-dark.png',
    contentType: 'image/png',
  },
  {
    id: nanoid(),
    url: '/static/marketing/screenshots/org-page-dark.png',
    name: 'Organization page',
    filename: 'org-page-dark.png',
    contentType: 'image/png',
  },
  {
    id: nanoid(),
    url: '/static/marketing/screenshots/settings-dark.png',
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
    cellaLoc: 142000,
    totalLoc: 162000,
    lightItems: [
      { id: nanoid(), url: '/static/marketing/showcases/raak-1.png', contentType: 'image/png' },
      { id: nanoid(), url: '/static/marketing/showcases/raak-2.png', contentType: 'image/png' },
    ],
    darkItems: [
      { id: nanoid(), url: '/static/marketing/showcases/raak-1-dark.png', contentType: 'image/png' },
      { id: nanoid(), url: '/static/marketing/showcases/raak-2-dark.png', contentType: 'image/png' },
    ],
  },
];
