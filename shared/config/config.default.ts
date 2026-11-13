import type {
  FederationConfig,
  NavigationConfig,
  ProductEmbedding,
  RequiredConfig,
  S3ConfigInput,
  ShareTargetConfig,
  SlotOf,
  SurfaceArrangement,
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
   * `lifecycle: 'owned'` additionally lets the nightly retention run delete embedded rows that
   * no live host references; the default 'shared' only strips references to dead rows.
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
   * The placements each surface shows, by id: `order` puts tabs on a channel's bar or sections on a
   * settings or profile page first, and `hidden` leaves them off. A channel link opens on the first
   * tab of its bar that needs no grant. The template arranges none.
   */
  surfaces: {} as Partial<Record<SlotOf<(typeof hierarchy.channelTypes)[number]>, SurfaceArrangement>>,

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
    rateLimits: { apiPointsPerHour: 1000, invitationEmailsPerDay: 250 },
  },

  /**
   * Tenants one user may create through onboarding (`selfCreateTenant`); a tenant reused while it holds no organization
   * counts once, and system admins have no cap. `0` turns self-service creation off, where a quota's `0` means unlimited.
   */
  selfServiceTenantsPerUser: 10,

  /**
   * What each tenant kind takes part in. A `live` tenant serves customers. A `test` tenant (the showcase seed, e2e and
   * pentest runs, staff trying a flow) stays out of the public counts and behind a kind filter in the admin lists. A
   * `demo` tenant is a visitor's throwaway, which also invites no one, starts with its own restrictions and goes after
   * `retention.demoTenantDays`.
   */
  tenantKinds: {
    live: { listed: true, counted: true, invitations: true, publicSharing: true, operatorNotices: true },
    test: { listed: false, counted: false, invitations: true, publicSharing: true, operatorNotices: false },
    demo: {
      listed: false,
      counted: false,
      invitations: false,
      publicSharing: false,
      operatorNotices: false,
      restrictions: { quotas: { attachment: 1 } },
    },
  },

  /** A visitor's demo, taken through `createDemo` while `has.demos` is on. */
  demo: { perDay: 500 },

  /** How long data lives, in days: `apply_retention()` and the jobs apply it, the privacy page states it. */
  retention: {
    activityDays: 90,
    deletedItemsDays: 120,
    unreferencedItemsDays: 30,
    archivedTenantDays: 120,
    demoTenantDays: 2,
    sessionDaysAfterExpiry: 30,
    tokenDaysAfterExpiry: 30,
    deviceDaysSinceSignIn: 400,
    devicesPerUser: 50,
    oidcPayloadDaysAfterUse: 30,
    requestDays: 365,
    invitationDays: 120,
    declinedInvitationHoldDays: 30,
    rateLimitDaysAfterWindow: 1,
    pushSubscriptionDaysUnseen: 400,
  },

  // System roles

  systemRoles: ['admin'] as const,

  // App identity

  name: 'Cella',
  slug: 'cella',
  domain: 'cellajs.com',
  description: 'A TypeScript template to build collaborative web apps with sync engine. MIT licensed.',
  keywords:
    'starter kit, fullstack, monorepo, typescript, hono, honojs, drizzle, baseui, react, postgres, pwa, offline, instant updates, realtime data, sync engine',
  /** Startup banner in the browser console and the API log, one string per line; empty prints none. */
  asciiArt: [
    '                         _ _',
    '   ▒▓█████▓▒     ___ ___| | | __ _',
    '   ▒▓█   █▓▒    / __/ _ \\ | |/ _` |',
    '   ▒▓█   █▓▒   | (_|  __/ | | (_| |',
    '   ▒▓█████▓▒    \\___\\___|_|_|\\__,_|',
  ],

  // Origin & services

  /**
   * The app's one origin. Every service is a path under it (`servicePaths`): the builder derives `frontendUrl`,
   * `backendUrl`, `yjsUrl`, `mcpUrl` and `oauthUrl`, and `services.<slug>.publicUrl`, from it. Same-origin keeps cookies
   * first-party (`__Host-`, SameSite=Strict), needs no CORS and collapses the CSP to 'self'. A mode file sets its own.
   */
  origin: 'https://www.cellajs.com',

  /**
   * This app's number on a developer's machine, 0-9 without 4, so stacks of different apps run side by side (shared/README.md).
   * It adds its number to the frontend port and its origin, and ten times its number to every other service port and
   * to the local database ports (`shared/src/local-database.ts`). With two stacks on one number, whichever backend binds
   * :4000 first answers every app's `/api` proxy.
   */
  devAppIndex: 0,

  /**
   * The services this app runs, each with the port it listens on, as app number 0 has them: the Vite proxy targets in
   * development, the deploy's container ports, and the folded workers' ports under `singleVM`. A mode file flips a
   * flag, e.g. mcp on in staging only. `frontend` is the Vite fallback
   * for when the origin carries no port (tunnel mode); otherwise the origin's port wins.
   */
  services: {
    frontend: { enabled: true, port: 3000 },
    // `internalPort`: the backend's internal listener, which the cdc and yjs workers dial.
    backend: { enabled: true, port: 4000, internalPort: 4005 },
    // The port is its health endpoint.
    cdc: { enabled: true, port: 4001 },
    yjs: { enabled: true, port: 4002 },
    mcp: { enabled: false, port: 4003 },
    /** The OAuth authorization server (issuer). Same origin under `/oauth`, so the session cookie reaches its consent screen. */
    oauth: { enabled: false, port: 4004 },
    // The job store's maintainer (cron and queue supervision); off means no sweeps or queues run anywhere.
    jobs: { enabled: true, port: 4006 },
  },

  // Cost escape hatch: when true the backend (SERVICE=api) also boots every enabled
  // service in-process: one VM for previews/small apps. Default false keeps the
  // split (one service per process). HTTP keeps its LB overlap on a deploy; the
  // co-hosted cdc and jobs wait for the old VM's slot and scheduler, so live
  // updates pause until it is reaped.
  singleVM: false,

  aboutUrl: '/about',
  statusUrl: '',
  productionUrl: 'https://www.cellajs.com',
  repositoryUrl: 'https://github.com/cellajs/cella',

  defaultRedirectPath: '/home',

  // Email

  senderEmail: 'notifications@shareworks.nl',
  supportEmail: 'info@cellajs.com',
  securityEmail: 'security@cellajs.com',

  // Flags

  has: {
    pwa: true,
    push: false,
    commentEmails: false,
    selfRegistration: false,
    waitlist: false,
    uploads: true,
    chatSupport: false,
    demos: false,
  },

  shareTarget: undefined as ShareTargetConfig | undefined,

  // apiVersion guards the API envelope; cookieVersion invalidates all sessions.
  // clientCacheVersion, a number that only rises, clears incompatible cached entities while preserving queued mutations.
  // Bump the relevant token with its change; CI requires cache bumps not covered by an evolution lens.

  apiVersion: 'v1',
  // Session cookies use the host-locked __Host- prefix; changing this version invalidates them.
  cookieVersion: 'v3',
  clientCacheVersion: 46,

  // Authentication

  enabledAuthStrategies: ['passkey', 'oauth', 'totp', 'magic', 'sso'] as const,
  enabledOAuthProviders: ['github'] as const,
  /**
   * Identity federations institutions sign in through (`sso`). The key is the session strategy, the identities
   * provider slug and the env prefix of the client secret (`SSO_<KEY>_CLIENT_ID` / `SSO_<KEY>_CLIENT_SECRET`); a
   * federation is live when those are set. Every mode but production signs in through its `sandbox`. A tenant's
   * connection names one entry and the institution behind it.
   */
  federations: {
    surfconext: {
      name: 'SURFconext',
      logoUrl: '/static/auth/surfconext-logo.svg',
      issuer: 'https://connect.surfconext.nl',
      idpMetadataUrl: 'https://metadata.surfconext.nl/idps-metadata.xml',
      sandbox: { issuer: 'https://connect.test.surfconext.nl', idpMetadataUrl: 'https://metadata.test.surfconext.nl/idps-metadata.xml' },
      scopes: ['openid'],
      clientAuthMethod: 'client_secret_basic',
      tenantClaim: 'schac_home_organization',
      snapshotClaims: ['eduperson_affiliation', 'eduperson_scoped_affiliation'],
      addressAuthority: true,
      mfaAcr: ['https://refeds.org/profile/mfa'],
    },
  } satisfies Record<string, FederationConfig>,
  tokenKinds: ['oauth-verification', 'invitation', 'confirm-mfa', 'magic', 'oauth-connect', 'step-up'] as const,

  /**
   * Maximum concurrent sessions per user. On sign-in, the oldest sessions beyond the cap are
   * revoked with the reason `session_cap`. Keep comfortably above a realistic device count. This is
   * bloat/abuse protection (bursts of sign-ins with stolen passwords, unbounded session accumulation), not a UX
   * feature. Regular and `mfa` sessions count together.
   */
  maxSessionsPerUser: 10,

  // A code verifies one step either side of now (RFC 6238 §5.2): each step more is one more code a guess can hit.
  // Google Authenticator reads neither the period nor the digits of the key URI, so other values lock its users out.
  totp: { intervalInSeconds: 30, gracePeriodInSeconds: 30, digits: 6 },

  // API configuration

  apiDescription: '⚠️ ATTENTION: PRERELEASE! This API is organized into modules based on logical domains.',

  // Page and body sizes

  pageSizes: {
    default: 40,
    users: 100,
    members: 40,
    organizations: 40,
    requests: 40,
    attachments: 40,
    pendingMemberships: 20,
  },

  maxBodySize: 1 * 1024 * 1024,

  // Storage & uploads (S3)

  s3: { region: 'nl-ams', host: 's3.nl-ams.scw.cloud' } as S3ConfigInput,

  uploadTemplateIds: ['thumbnail', 'banner', 'attachment', 'newsletter'] as const,

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

  gleapToken: '1ZoAxCRA83h5pj7qtRSvuz7rNNN9iXDd',
  // OpenFreeMap: free, no key, no cookies. Any MapLibre style URL works; its origin is added to the CSP.
  mapStyleUrls: { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' },
  mapZoom: 3,
  maplePublicIngestKey: 'maple_pk_LnUSK6-_5j3orVrlZ1Hv6I1pxzDh3SJ5',
  /**
   * Hosts a Web Push subscription endpoint may name: the push services of Chrome and most Chromium browsers (FCM),
   * Firefox, Safari and Edge (WNS). `*.` matches any subdomain; entries compare lowercased, without one trailing dot.
   * The server POSTs each push to the stored endpoint, so registration refuses every other host.
   */
  pushServiceHosts: ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', '*.notify.windows.com'],

  // Theming & UI

  theme: {
    navigation: { sidebarTextLabels: false, sidebarWidthExpanded: '16rem', sidebarWidthCollapsed: '4rem', sheetPanelWidth: '20rem' },
    colors: {},
    strokeWidth: 1.75,
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
  },
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

  defaultLanguageCode: 'en' as const,
  languageCodes: ['en', 'nl'] as const,
  commonRegionCodes: ['FR', 'DE', 'NL', 'UA', 'US', 'GB'],
  /** How a date reads in tables and tiles: 'day' as "Today" or "Sep 23" with the time on hover, 'minute' with the time shown. */
  listDatePrecision: 'day' as const,

  // Company details

  company: {
    name: 'CellaJS',
    email: 'info@cellajs.com',
    phone: '+31 6 12345678',
    address: {
      streetAddress: 'Drizzle Road 42',
      postalCode: '90210 JS',
      city: 'Hono City',
      regionCode: 'NL',
      directionsUrl: 'https://goo.gl/maps/SQlrh',
      coordinates: { lat: 51.92760809717153, lng: 4.47421039909924 },
    },
    registration: 'Chamber of Commerce (KvK): 578 25 920',
    vatNumber: 'NL001234567B01',
    scheduleCallUrl: 'https://cal.com/flip-van-haaren',
    socialUrl: 'https://bsky.app/profile/flipvh.bsky.social',
    chatUrl: 'https://matrix.to/#/!fvwljIbZIqzhNvjKvk:matrix.org',
  },

  // User defaults

  defaultUserFlags: {},

  // Organization defaults

  defaultOrganizationFlags: {},

  defaultSetupConfig: {},
} satisfies RequiredConfig;
