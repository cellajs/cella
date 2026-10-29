import {
  Building2Icon,
  CheckCheckIcon,
  CloudIcon,
  CodeXmlIcon,
  DatabaseIcon,
  GaugeIcon,
  HeartPulseIcon,
  KeyRoundIcon,
  RadioTowerIcon,
  RocketIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
  WifiOffIcon,
} from 'lucide-react';
import type { GetPublicCountsResponse } from 'sdk';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import type { TKey } from '~/lib/i18n-locales';
import type { CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { ElementIcon } from '~/modules/common/icons/element';
import { GithubIcon } from '~/modules/common/icons/github';
import type { IconComponent } from '~/modules/common/icons/types';
import type { InfoCard } from '~/modules/marketing/about/info-cards';
import type { PricingPlan } from '~/modules/marketing/about/pricing';
import type { ShowcaseItem } from '~/modules/marketing/about/showcase';
import type { FooterLinkProps } from '~/modules/marketing/footer';
import type { InfoGridItem } from '~/modules/marketing/info-grid';

// The app's marketing copy. The module's pages import each export by name: edit the values, keep the names.

// Nav

export const marketingNavConfig = [
  { id: 'features', url: '/features', hash: '' },
  { id: 'sync_engine', url: '/sync-engine', hash: '' },
  // { id: 'pricing', url: '/about', hash: 'pricing' },
  { id: 'docs', url: '/docs', hash: '' },
] as const satisfies readonly { id: TKey; url: string; hash: string }[];

// Footer

/** @public */
export const socials = [
  { title: 'c:social', href: appConfig.company.socialUrl, icon: CloudIcon },
  { title: 'c:chat', href: appConfig.company.element, icon: ElementIcon },
  { title: 'c:github', href: appConfig.company.githubUrl, icon: GithubIcon },
] satisfies (FooterLinkProps & { icon: IconComponent })[];

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
      { title: 'c:architecture', href: 'https://github.com/cellajs/cella/blob/main/cella/ARCHITECTURE.md' },
    ],
  },
  {
    title: 'c:connect',
    links: [{ title: 'c:contact_us', href: '/contact' }, ...socials],
  },
] satisfies { title: TKey; hideOnMobile?: boolean; links: FooterLinkProps[] }[];

// Legal

export const legalLinks = [
  { title: 'c:legal', href: '/legal' },
  { title: 'c:accessibility', href: '/accessibility' },
] satisfies FooterLinkProps[];

// About - Stack (tech-stack tile grid on /about)

export const stackItems = [
  { id: 'hono' },
  { id: 'react' },
  { id: 'drizzle' },
  { id: 'baseui' },
  { id: 'openapi' },
  { id: 'vite' },
  { id: 'yjs' },
  { id: 'opentelemetry' },
  { id: 'pulumi' },
];

// Features page (/features): each item reads `about:features.<id>` and `about:features.<id>.text`.

export type FeatureCategory = 'security' | 'auth' | 'compliance' | 'ux' | 'dx' | 'deploy' | 'performance' | 'data';

export const featureCategoryIcons = {
  security: ShieldCheckIcon,
  auth: KeyRoundIcon,
  compliance: ScaleIcon,
  ux: SparklesIcon,
  dx: CodeXmlIcon,
  deploy: RocketIcon,
  performance: GaugeIcon,
  data: DatabaseIcon,
} as const satisfies Record<FeatureCategory, IconComponent>;

export const featuresPageItems: InfoGridItem<FeatureCategory>[] = [
  // Data modelling
  { id: 'explicit_routes', category: 'data' },
  { id: 'entity_hierarchy', category: 'data' },
  { id: 'schema_evolution', category: 'data' },
  { id: 'user', category: 'data' },
  { id: 'organization', category: 'data' },
  // Optional built-in product entities (can be removed in apps)
  { id: 'attachment', category: 'data' },

  // Security & multi-tenancy
  { id: 'tenant_isolation', category: 'security' },
  { id: 'permission_engine', category: 'security' },
  { id: 'guard_chain', category: 'security' },
  { id: 'secret_redaction', category: 'security' },
  { id: 'rate_limiting', category: 'security' },
  { id: 'security_tests', category: 'security' },

  // Authentication
  { id: 'magic_link', category: 'auth' },
  { id: 'passkey', category: 'auth' },
  { id: 'oauth', category: 'auth' },
  { id: 'sso_federation', category: 'auth' },
  { id: 'mfa', category: 'auth' },
  { id: 'session_management', category: 'auth' },
  { id: 'impersonation', category: 'auth' },
  { id: 'service_accounts', category: 'auth' },

  // Privacy & compliance
  { id: 'retention', category: 'compliance' },
  { id: 'gdpr_legal', category: 'compliance' },
  { id: 'accessibility', category: 'compliance' },
  { id: 'audit_trail', category: 'compliance' },

  // UI & UX
  { id: 'responsive', category: 'ux' },
  { id: 'pwa', category: 'ux' },
  { id: 'i18n', category: 'ux' },
  { id: 'data_grid', category: 'ux' },
  { id: 'blocknote_editor', category: 'ux' },
  { id: 'notifications', category: 'ux' },

  // Developer experience
  { id: 'cella_cli', category: 'dx' },
  { id: 'openapi_sdk_docs', category: 'dx' },
  { id: 'mcp', category: 'dx' },
  { id: 'typed_errors', category: 'dx' },
  { id: 'mock_generators', category: 'dx' },
  { id: 'email_templates', category: 'dx' },
  { id: 'storybook', category: 'dx' },
  { id: 'agent_skills', category: 'dx' },

  // Deployment & infrastructure
  { id: 'pulumi_iac', category: 'deploy' },
  { id: 'docker', category: 'deploy' },
  { id: 'eu_cloud', category: 'deploy' },
  { id: 'zero_downtime', category: 'deploy' },

  // Performance & observability
  { id: 'otel', category: 'performance' },
  { id: 'load_testing', category: 'performance' },
];

// Sync engine page (/sync-engine): the features page's keys, its own categories, and `layers` badges for where each capability runs.

export type SyncCategory = 'realtime' | 'offline' | 'consistency' | 'resilience';

export const syncCategoryIcons = {
  realtime: RadioTowerIcon,
  offline: WifiOffIcon,
  consistency: CheckCheckIcon,
  resilience: HeartPulseIcon,
} as const satisfies Record<SyncCategory, IconComponent>;

export type SyncLayer = 'client' | 'api' | 'cdc' | 'yjs';

export interface SyncPageItem extends InfoGridItem<SyncCategory> {
  layers: SyncLayer[];
}

export const syncPageItems: SyncPageItem[] = [
  // Realtime & collaboration
  { id: 'live_changes', category: 'realtime', layers: ['cdc', 'api', 'client'] },
  { id: 'yjs_collaboration', category: 'realtime', layers: ['yjs', 'api', 'client'] },
  { id: 'embedded_propagation', category: 'realtime', layers: ['api', 'client'] },
  { id: 'multi_tab', category: 'realtime', layers: ['client'] },
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
  { id: 'gap_detection', category: 'consistency', layers: ['cdc', 'api', 'client'] },
  { id: 'soft_delete', category: 'consistency', layers: ['api', 'cdc'] },
  { id: 'per_field_merge', category: 'consistency', layers: ['api'] },
  { id: 'text_merge', category: 'consistency', layers: ['yjs', 'client'] },
  { id: 'canonical_queries', category: 'consistency', layers: ['client'] },
  { id: 'cache_integrity', category: 'consistency', layers: ['client', 'api'] },
  { id: 'ttl_cache', category: 'consistency', layers: ['api'] },

  // Resilience & graceful degradation
  { id: 'rest_fallback', category: 'resilience', layers: ['client'] },
  { id: 'stream_reconnect', category: 'resilience', layers: ['client'] },
  { id: 'at_least_once', category: 'resilience', layers: ['cdc'] },
  { id: 'one_failure_path', category: 'resilience', layers: ['cdc'] },
  { id: 'api_never_waits', category: 'resilience', layers: ['api'] },
  { id: 'verified_books', category: 'resilience', layers: ['cdc', 'api', 'client'] },
];

// About - Cards

export const cards: InfoCard[] = [
  { name: 'Transloadit', country: 'DE', url: 'transloadit.com', id: 'transloadit' },
  { name: 'BlockNote', country: 'NL', url: 'blocknotejs.org', id: 'blocknote' },
  { name: 'Scaleway', country: 'FR', url: 'scaleway.com', id: 'scaleway' },
  { name: 'One dollar stats', country: 'UA', url: 'onedollarstats.com', id: 'onedollarstats' },
  { name: 'Brevo', country: 'FR', url: 'brevo.com', id: 'brevo' },
  { name: 'Matrix', country: 'GB', url: 'matrix.org', id: 'matrix', invert: true },
  { name: 'Gleap', country: 'AT', url: 'gleap.io', id: 'gleap' },
];

// About - Pricing plan

export const pricingPlans: PricingPlan[] = [
  { id: 'donate', action: 'contact_us', featureCount: 5 },
  { id: 'build', action: 'waitlist_request', featureCount: 4, className: 'ring-4 ring-primary/5', popular: true },
  { id: 'partner', action: 'contact_us', featureCount: 3 },
];

// About - FAQ

export const faqsData = [
  { id: 'production-ready', link: appConfig.company.githubUrl },
  { id: 'cella-vs-next' },
  { id: 'alternative-to-nextjs' },
  { id: 'cella-made-in-europe' },
];

// About - Counters

export const counts = [
  { id: 'user', title: 'c:user_other', icon: UsersIcon },
  { id: 'organization', title: 'c:organization_other', icon: Building2Icon },
] as const satisfies readonly { id: keyof GetPublicCountsResponse; title: TKey; icon: IconComponent }[];

// About - Why

export const whyItems = [{ id: 'implementation-ready' }, { id: 'prebuilt-endpoints' }, { id: 'dedicated-community' }];

/** A WebP slide at `/static/marketing/<path>`; `name` is its alt text. */
const screenshot = (path: string, name: string): CarouselItemData => ({
  id: nanoid(),
  url: `/static/marketing/${path}`,
  name,
  filename: path.split('/').at(-1),
  contentType: 'image/webp',
});

export const whyLightSlides = [
  screenshot('screenshots/system-page.webp', 'System page'),
  screenshot('screenshots/org-page.webp', 'Organization page'),
  screenshot('screenshots/settings.webp', 'User settings page'),
];
export const whyDarkSlides = [
  screenshot('screenshots/system-page-dark.webp', 'System page'),
  screenshot('screenshots/org-page-dark.webp', 'Organization page'),
  screenshot('screenshots/settings-dark.webp', 'User settings page'),
];

// About - Showcase

export const showcaseItems: ShowcaseItem[] = [
  {
    id: 'raak',
    url: 'https://www.raak.dev',
    cellaLoc: 142000,
    totalLoc: 162000,
    lightItems: [screenshot('showcases/raak-1.webp', 'raak board'), screenshot('showcases/raak-2.webp', 'raak task')],
    darkItems: [screenshot('showcases/raak-1-dark.webp', 'raak board'), screenshot('showcases/raak-2-dark.webp', 'raak task')],
  },
];
