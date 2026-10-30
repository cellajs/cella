import type {
  ConfigMode,
  FederationConfig,
  NavigationConfig,
  ProductEmbedding,
  RequiredConfig,
  S3ConfigInput,
  SlotOf,
} from '../src/config-builder/types.ts';
import { nonEmpty } from '../src/config-builder/utils.ts';
import { hierarchy } from './hierarchy-config.ts';

export { hierarchy, roles } from './hierarchy-config.ts';

export const config = {
  // Entity data model, derived from the hierarchy: the builder in hierarchy-config.ts is the
  // single declaration of the entity taxonomy.

  /** All entity types in the app. */
  entityTypes: nonEmpty(hierarchy.allTypes),

  /** Channel entities with memberships. */
  channelEntityTypes: nonEmpty(hierarchy.channelTypes),

  /** Product/content entities. */
  productEntityTypes: nonEmpty(hierarchy.productTypes),

  /**
   * Product entity types tracked for seen/unseen counts.
   * Unseen counts are grouped by the parent channel entity of each tracked type.
   */
  seenTrackedProductTypes: ['attachment'] as const,

  /**
   * Channels whose attachments table offers a direct upload, i.e. a home the create can write into.
   * Apps whose attachments only come from host media blocks (an owned embedding) declare none.
   */
  attachmentUploadTargets: ['organization'] as const,

  /**
   * Product types with per-member stats in the members table (`include=counts` on GET /members):
   * a count and a last-activity stamp per type; the first is the "last posted" sort key.
   */
  memberStatProductTypes: ['attachment'] as const,

  /** Maps entity types to their ID column names, derived from the hierarchy (`${type}Id`). */
  entityIdColumnKeys: hierarchy.idColumnKeys,

  entityActions: ['create', 'read', 'update', 'delete'] as const,

  /**
   * Not entities, but activities are logged for them. Tenant- or system-owned rows only: rows a user owns
   * (sessions, identities, passkeys, emails) are self-audited through the account pages and notifications.
   */
  resourceTypes: ['request', 'membership', 'inactive_membership', 'tenant', 'system_role', 'service_account', 'api_key', 'oauth_client'] as const,

  /**
   * Product embeddings: declares which product entities are embedded as ID arrays inside
   * other product entities. Apps extend when adding new embedding relationships.
   * `lifecycle: 'owned'` additionally lets CDC garbage-collect embedded rows that no live
   * host references; the default 'shared' only strips references to dead rows.
   */
  productEmbeddings: [] as readonly ProductEmbedding<(typeof hierarchy.productTypes)[number]>[],

  /**
   * User menu structure of channel entities with optional nested subentities.
   * If subentityType is set, the table must include `${entity}Id` foreign key.
   */
  menuStructure: [{ entityType: 'organization', subentityType: null } as const],

  /** Nav bar, how the menu groups channels and where page tabs show: `NavigationConfig`. */
  navigation: { navBar: true, menu: 'all', pageTabs: {} } as NavigationConfig<(typeof hierarchy.channelTypes)[number]>,

  /**
   * Placement ids per surface, in display order: tabs on a channel's bar, sections on a settings or
   * profile page. A surface listed here is total, so an id left out has no placement on it; a
   * surface left out renders every registered placement in its declared order. The first id of a
   * tab bar is also the tab a channel link opens on. The template lists none.
   */
  surfaces: {} as Partial<Record<SlotOf<(typeof hierarchy.channelTypes)[number]>, readonly string[]>>,

  defaultRestrictions: {
    quotas: {
      // 1 tenant = 1 organization. Matches the hard structural cap (unique index on
      // organizations.tenant_id); keep at 1 so the soft quota never advertises slots the
      // 1:1 backstop will reject anyway. See create-organizations.ts.
      organization: 1,
      user: 1000,
      attachment: 100,
      serviceAccount: 20,
      apiKey: 100,
    },
    rateLimits: { apiPointsPerHour: 1000 },
  } as const,

  /** How long data lives, in days: `apply_retention()` and the jobs apply it, the privacy page states it. */
  retention: {
    activityDays: 90,
    deletedItemsDays: 120,
    archivedTenantDays: 120,
    sessionDaysAfterExpiry: 30,
    tokenDaysAfterExpiry: 30,
    deviceDaysUnseen: 400,
    devicesPerUser: 50,
    oidcPayloadDaysAfterUse: 30,
    requestDays: 365,
    invitationDays: 120,
    rateLimitDaysAfterWindow: 1,
    pushSubscriptionDaysUnseen: 400,
  },

  // System roles

  systemRoles: ['admin'] as const,

  // App identity

  name: '__project_name__',
  slug: '__project_slug__',
  domain: '__project_slug__.example.com',
  description: '__project_name__: powered by Cella.',
  keywords:
    'starter kit, fullstack, monorepo, typescript, hono, honojs, drizzle, baseui, react, postgres, pwa, offline, instant updates, realtime data, sync engine',

  // URLs & endpoints

  // Same-origin: every service is a path under the app origin, so cookies stay
  // first-party (`__Host-`, SameSite=Strict), CORS disappears and CSP collapses
  // to 'self'. The LB routes /api, /yjs and /mcp by path prefix (matchPathBegin).
  // These URLs are the single source: the config builder derives `services.<slug>.publicUrl`
  // from them, so mode configs override the URLs here and never the `services` block.
  frontendUrl: 'https://__project_slug__.example.com',
  backendUrl: 'https://__project_slug__.example.com/api',
  backendAuthUrl: 'https://__project_slug__.example.com/api/auth',
  yjsUrl: 'wss://__project_slug__.example.com/yjs',
  mcpUrl: 'https://__project_slug__.example.com/mcp',
  /** The OAuth authorization server (issuer). Same origin under `/oauth`, so the session cookie reaches its consent screen. */
  oauthUrl: 'https://__project_slug__.example.com/oauth',
  // Which services this app runs; a mode config flips a flag here, e.g. mcp on in staging only.
  services: {
    frontend: { enabled: true as boolean },
    backend: { enabled: true as boolean },
    cdc: { enabled: true as boolean },
    yjs: { enabled: false as boolean },
    mcp: { enabled: false as boolean },
    oauth: { enabled: false as boolean },
    // The job store's maintainer (cron and queue supervision); off means no sweeps or queues run anywhere.
    jobs: { enabled: true as boolean },
  },

  // Cost escape hatch: when true the backend (MODE=api) also boots every enabled
  // service in-process: one VM for previews/small apps. Default false keeps the
  // split (one service per process). HTTP keeps its LB overlap on a deploy; the
  // co-hosted cdc and jobs wait for the old VM's slot and scheduler, so live
  // updates pause until it is reaped.
  singleVM: false as boolean,

  aboutUrl: '/about',
  statusUrl: 'https://status.__project_slug__.example.com',
  productionUrl: 'https://__project_slug__.example.com',

  defaultRedirectPath: '/home',
  welcomeRedirectPath: '/welcome',

  // Email

  senderEmail: 'notifications@__project_slug__.example.com',
  supportEmail: 'support@__project_slug__.example.com',
  securityEmail: 'security@__project_slug__.example.com',

  // Mode & flags

  mode: 'development' as ConfigMode,
  maintenance: false,

  /**
   * Local dev listen ports, also the Vite proxy targets. Ports are machine-global, so an app must
   * offset this whole block together with the port in the `frontendUrl` family (e.g. +20). With
   * two stacks up, whichever backend binds :4000 first answers every app's `/api` proxy. Keep the
   * app's offset in the tens: a linked git worktree adds 100 per worktree on its own, or
   * `DEV_PORT_OFFSET` sets that by hand (shared/README.md).
   * `PORT`-style env vars still override at runtime. `frontend` is the Vite fallback for when
   * `frontendUrl` carries no port (tunnel mode); otherwise the URL port wins. `internal` is the
   * backend's internal listener, which the cdc and yjs workers dial (`INTERNAL_PORT` overrides it).
   */
  devPorts: {
    frontend: 3000,
    api: 4000,
    cdcHealth: 4001,
    yjs: 4002,
    mcp: 4003,
    oauth: 4004,
    internal: 4005,
    jobs: 4006,
  },

  has: {
    pwa: true as boolean,
    push: false as boolean,
    commentEmail: false as boolean,
    selfRegistration: false as boolean,
    waitlist: false as boolean,
    /** Off until S3 is configured: files stay in the browser (IndexedDB). */
    uploadEnabled: false as boolean,
    chatSupport: false as boolean,
  },

  // apiVersion guards the API envelope; cookieVersion invalidates all sessions.
  // clientCacheVersion clears incompatible cached entities while preserving queued mutations.
  // Bump the relevant token with its change; CI requires cache bumps not covered by an evolution lens.

  apiVersion: 'v1',
  // Session cookies use the host-locked __Host- prefix; changing this version invalidates them.
  cookieVersion: 'v1',
  clientCacheVersion: 'v1',

  // Authentication

  /** No `sso` until the app declares a federation. */
  enabledAuthStrategies: ['passkey', 'oauth', 'totp', 'magic'] as const,
  enabledOAuthProviders: ['github'] as const,
  /**
   * Identity federations institutions sign in through (`sso`). The key is the session strategy, the identities
   * issuer slug and the env prefix of the client secret (`SSO_<KEY>_CLIENT_ID` / `SSO_<KEY>_CLIENT_SECRET`); a
   * federation is live when those are set. Mode configs point a key at its test issuer. A tenant's connection names
   * one entry and the institution behind it. A new app starts with none; the template's own config declares
   * `surfconext` as a worked example.
   */
  federations: {} as Record<string, FederationConfig>,
  tokenTypes: ['oauth-verification', 'invitation', 'confirm-mfa', 'magic', 'oauth-connect', 'step-up'] as const,

  /**
   * Maximum concurrent sessions per user. On sign-in, the oldest sessions beyond the cap are
   * hard-deleted (Hanko-style eviction). Keep comfortably above a realistic device count. This is
   * bloat/abuse protection (bursts of sign-ins with stolen passwords, unbounded session accumulation), not a UX
   * feature. Regular and `mfa` sessions count together; `impersonation` sessions are left alone.
   */
  maxSessionsPerUser: 10,

  // A code verifies one step either side of now (RFC 6238 §5.2): each step more is one more code a guess can hit.
  totp: { intervalInSeconds: 30, gracePeriodInSeconds: 30, digits: 6 },

  // API configuration

  apiDescription: '⚠️ ATTENTION: PRERELEASE! This API is organized into modules based on logical domains.',

  // Request limits

  requestLimits: {
    default: 40,
    users: 100,
    members: 40,
    organizations: 40,
    requests: 40,
    attachments: 40,
    pendingMemberships: 20,
  },

  jsonBodyLimit: 1 * 1024 * 1024,

  // Storage & uploads (S3)

  s3: { region: '', host: '' } as S3ConfigInput,

  uploadTemplateIds: ['avatar', 'cover', 'attachment', 'newsletter'] as const,

  /**
   * Origin of the media asset CDN, which serves re-hosted images as immutable content-hash objects. A media block may
   * reference an asset by URL there. Empty while no asset service is configured, so no URL passes as an asset.
   */
  mediaAssetOrigin: '',

  uppy: {
    defaultRestrictions: {
      maxFileSize: 10 * 1024 * 1024,
      maxNumberOfFiles: 1,
      allowedFileTypes: ['.jpg', '.jpeg', '.png'],
      maxTotalFileSize: 100 * 1024 * 1024,
      minFileSize: null,
      minNumberOfFiles: null,
      requiredMetaFields: [],
    },
  },

  localBlobStorage: {
    enabled: true,
    maxFileSize: 10 * 1024 * 1024,
    maxTotalSize: 1024 * 1024 * 1024,
    allowedContentTypes: [] as string[],
    excludedContentTypes: ['video/*'] as string[],
    downloadConcurrency: 2,
    downloadRetryAttempts: 3,
    uploadRetryAttempts: 3,
    uploadRetryDelays: [60000, 300000, 900000] as const,
  },

  // Third-party services

  gleapToken: '',
  /**
   * MapLibre style URL per color mode for the contact map; empty hides the map. OpenFreeMap needs no key:
   * light 'https://tiles.openfreemap.org/styles/positron', dark 'https://tiles.openfreemap.org/styles/dark'.
   * The CSP allows each style's origin; tiles, fonts and icons must come from that same origin.
   */
  mapStyleUrls: { light: '', dark: '' },
  matrixURL: 'https://matrix-client.matrix.org',
  /** Maple.dev public ingest key, safe to embed in the frontend bundle; empty turns frontend export off. */
  maplePublicIngestKey: '',
  /**
   * Hosts a Web Push subscription endpoint may name: the push services of Chrome and most Chromium browsers (FCM),
   * Firefox, Safari and Edge (WNS). `*.` matches any subdomain; entries compare lowercased, without one trailing dot.
   * The server POSTs each push to the stored endpoint, so registration refuses every other host.
   */
  pushServiceHosts: ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', '*.notify.windows.com'],

  // Theming & UI

  theme: {
    navigation: { hasSidebarTextLabels: false, sidebarWidthExpanded: '16rem', sidebarWidthCollapsed: '4rem', sheetPanelWidth: '20rem' },
    colors: {},
    strokeWidth: 1.5,
    /**
     * Mail colors, hex: mail clients read neither CSS variables nor oklch. Some clients recolor a mail for dark mode and
     * leave dark fills alone, so the button's edge, or a mid-tone fill, must stand out on white and on a dark panel;
     * `backend/tests/emails/email-colors.test.ts` checks the ratios. `darkButton` is the button under the mail's own dark
     * styles, which Apple Mail and the Outlook apps apply.
     */
    email: {
      button: '#262626',
      buttonEdge: '#808080',
      buttonLabel: '#ffffff',
      darkButton: '#fafafa',
      darkButtonLabel: '#262626',
    },
    screenSizes: { xs: '420px', sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1400px' },
  } as const,
  placeholderColors: [
    'bg-blue-300',
    'bg-lime-300',
    'bg-orange-300',
    'bg-yellow-300',
    'bg-green-300',
    'bg-teal-300',
    'bg-indigo-300',
    'bg-purple-300',
    'bg-pink-300',
    'bg-red-300',
  ],

  // Localization

  defaultLanguage: 'en' as const,
  languages: ['en', 'nl'] as const,
  commonCountries: ['FR', 'DE', 'NL', 'UA', 'US', 'GB'],

  // Company details

  company: {
    name: '__project_name__',
    shortName: '__project_name__',
    email: 'info@__project_slug__.example.com',
    supportEmail: 'support@__project_slug__.example.com',
    tel: '',
    streetAddress: '',
    postcode: '',
    city: '',
    country: '',
    registration: '',
    vatNumber: '',
    directionsUrl: '',
    scheduleCallUrl: '',
    socialUrl: '',
    blueskyHandle: '',
    element: '',
    githubUrl: '',
    mapZoom: 3,
    coordinates: { lat: 0, lng: 0 },
  },

  // User defaults

  defaultUserFlags: { finishedOnboarding: false },

  // Organization defaults

  defaultOrganizationFlags: {},

  defaultSetupConfig: {},
} satisfies RequiredConfig;
