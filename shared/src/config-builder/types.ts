/**
 * A boolean or number leaf as its base type. The default config's `satisfies` keeps a literal `true` or `1` where the
 * contextual type is a union, so without this a mode file could not set the leaf to anything else, and a reader's
 * `if (!flag)` would narrow to never.
 */
export type WidenScalars<T> = T extends boolean
  ? boolean
  : T extends number
    ? number
    : T extends (...args: never[]) => unknown
      ? T
      : T extends object
        ? { [K in keyof T]: WidenScalars<T[K]> }
        : T;

/** What a mode file may override: any part of the default config, scalars widened. */
export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : WidenScalars<T>;

export type ConfigMode = 'development' | 'tunnel' | 'staging' | 'production' | 'test';
export type BaseAuthStrategies = 'passkey' | 'oauth' | 'totp' | 'magic' | 'sso';

/**
 * An identity federation institutions sign in through (the `sso` method): public metadata only. The key it sits
 * under in `federations` is the session strategy, the identities issuer slug and the env prefix of its client
 * secret (`SSO_<KEY>_CLIENT_ID`, `SSO_<KEY>_CLIENT_SECRET`).
 */
export interface FederationConfig {
  /** Shown on sign-in buttons and in session lists. */
  label: string;
  /**
   * Path of the federation's logo under the frontend's public folder. Its "sign in with your institution" button shows
   * the logo in place of the generic icon and of the federation's name; use the file the federation publishes, unaltered.
   */
  logo?: string;
  /** OIDC issuer; endpoints come from its discovery document. */
  issuer: string;
  /** SAML metadata feed listing the federation's institutions (entity ids, names, logos, domains); optional. */
  idpMetadataUrl?: string;
  /** The federation's test issuer and metadata feed, which every mode but production signs in through. */
  sandbox?: { issuer: string; idpMetadataUrl?: string };
  scopes: readonly string[];
  clientAuthMethod: 'client_secret_basic' | 'client_secret_post';
  /** The claim that names the institution; a connection accepts a list of its values. */
  tenantClaim: string;
  /** Claims kept as a snapshot on the identity row; nothing in the template reads them for authorization. */
  snapshotClaims: readonly string[];
  /**
   * Whether the federation's institutions operate the mailboxes of their domains, so a sign-in proves an address on
   * one of its connection's domains.
   */
  addressAuthority: boolean;
  /**
   * The `acr` values by which an institution asserts it used multi-factor authentication. A sign-in carrying one starts
   * stepped up, as a second factor would. Absent or empty: no SSO sign-in of this federation counts as a factor.
   */
  mfaAcr?: readonly string[];
}
/** The OAuth providers the template signs in with; `enabledOAuthProviders` picks among them. */
export const oauthProviders = ['github', 'google', 'microsoft'] as const;
export type BaseOAuthProviders = (typeof oauthProviders)[number];

/** Only host and region are required; app-config derives the rest from the slug. */
export interface S3ConfigInput {
  region: string;
  host: string;
  publicBucket?: string;
  privateBucket?: string;
  publicCDNUrl?: string;
  privateCDNUrl?: string;
}

export type S3Config = Required<S3ConfigInput>;

export interface RequestLimitsConfig {
  default: number;
  [key: string]: number;
}

export interface HasFlagsConfig {
  pwa: boolean;
  /** Web Push delivery for notifications; sending also needs VAPID_* backend env vars. */
  push: boolean;
  /** Comment and reply emails: shows the preference in the account settings and mails those who turn it on. */
  commentEmail: boolean;
  selfRegistration: boolean;
  waitlist: boolean;
  uploadEnabled: boolean;
  chatSupport: boolean;
  /** Visitors can take a demo (`createDemo`): a throwaway account with a `demo` tenant, signed in by a `demo` session. */
  demos: boolean;
}

/**
 * What a tenant is for: `live` serves customers, `test` serves staff and automated runs (the showcase seed, e2e and
 * pentest runs), `demo` is a visitor's throwaway. Each kind's behavior comes from `tenantKinds`.
 */
export const tenantKindValues = ['live', 'test', 'demo'] as const;
export type TenantKind = (typeof tenantKindValues)[number];

/** What a tenant kind takes part in; `Q` names the keys a quota can take. */
export interface TenantKindConfig<Q extends string = string> {
  /** Shown in the admin lists of tenants and organizations when the request names no kind. */
  listed: boolean;
  /** Counted in the public counts, with the members such tenants alone hold. */
  counted: boolean;
  /** May invite, which mails third parties. */
  invitations: boolean;
  /** May share with the public: a public channel or product, a link preview of its content. */
  publicSharing: boolean;
  /** The operator hears of a tenant of this kind being created or removed. */
  operatorNotices: boolean;
  /** Laid over `defaultRestrictions` when a tenant of this kind is created. */
  restrictions?: {
    quotas?: Partial<Record<Q, number>>;
    rateLimits?: Partial<{ apiPointsPerHour: number; invitationMailsPerDay: number }>;
  };
}

/** A visitor's demo (`has.demos`). */
export interface DemoConfig {
  /** Demos created a day across every visitor; past it `createDemo` answers 503. */
  perDay: number;
}

/** A service of the app: whether it runs, and the port it listens on as app number 0 (`devAppIndex` moves it). */
export interface AppServiceConfig {
  enabled: boolean;
  port: number;
  /** A second listener only the private network reaches; the backend's, for the CDC socket and the Yjs relay's routes. */
  internalPort?: number;
}

export interface TotpConfig {
  intervalInSeconds: number;
  gracePeriodInSeconds: number;
  digits: number;
}

export interface UppyRestrictionsConfig {
  maxFileSize: number;
  maxNumberOfFiles: number;
  allowedFileTypes: string[];
  maxTotalFileSize: number;
  minFileSize: number | null;
  minNumberOfFiles: number | null;
  requiredMetaFields: string[];
}

/** Which attachments a device keeps in IndexedDB for offline use, and how it downloads and uploads them. */
export interface LocalBlobStorageConfig {
  enabled: boolean;
  /** Bytes of the largest file a device keeps for offline use; a larger one keeps only its previews. */
  maxFileSize: number;
  /** Bytes downloaded files may take on one device, across organizations: the budget of the largest offline files tier. */
  maxTotalSize: number;
  /** Content-type patterns (`image/*`) a kept file must match, empty for any; previews are kept whatever the type. */
  allowedContentTypes: string[];
  /** Content-type patterns whose file no device keeps offline; their previews are kept. */
  excludedContentTypes: string[];
  downloadConcurrency: number;
  downloadRetryAttempts: number;
  uploadRetryAttempts: number;
  uploadRetryDelays: readonly number[];
}

/** Periods in days. A tenant cannot change them: they bound what the operator keeps for every organization. */
export interface RetentionConfig {
  /** Activity history, notifications and seen marks; also how long a device may stay away before it starts over. */
  activityDays: number;
  /** A deleted row, its files and its collaborative document, from the delete; at least `activityDays` + 30. */
  deletedItemsDays: number;
  /** An archived tenant (an organization deleted, or a contract ended), from the archiving; a system admin can restore it until then. */
  archivedTenantDays: number;
  /** A demo tenant, from its creation; it goes with everything in it and the account that took it. */
  demoTenantDays: number;
  sessionDaysAfterExpiry: number;
  tokenDaysAfterExpiry: number;
  deviceDaysUnseen: number;
  /** Known devices kept per user, the most recently seen. */
  devicesPerUser: number;
  oidcPayloadDaysAfterUse: number;
  /** Contact messages and waitlist entries; a newsletter subscription stays until the unsubscribe. */
  requestDays: number;
  /** Rejected join requests, and invitations after their last mail; a held invitation goes with its draft channel. */
  invitationDays: number;
  /** A declined invitation, from the decline: no invite opens it again or mails its address. At most `invitationDays`. */
  declinedInvitationHoldDays: number;
  rateLimitDaysAfterWindow: number;
  pushSubscriptionDaysUnseen: number;
}

export interface ThemeNavigationConfig {
  hasSidebarTextLabels: boolean;
  sidebarWidthExpanded: string;
  sidebarWidthCollapsed: string;
  sheetPanelWidth: string;
}

/** Mail colors, each `#rrggbb`. */
export interface ThemeEmailConfig {
  button: string;
  /** The button's 2px border: its shape where a client darkens the panel and leaves a dark fill alone. */
  buttonEdge: string;
  buttonLabel: string;
  /** The button under the mail's own dark styles. */
  darkButton: string;
  darkButtonLabel: string;
}

export interface ThemeConfig {
  navigation: ThemeNavigationConfig;
  colors: Record<string, string>;
  strokeWidth: number;
  screenSizes: Record<string, string>;
  email: ThemeEmailConfig;
}

export interface CompanyAddress {
  streetAddress: string;
  postalCode: string;
  city: string;
  /** The country's ISO 3166-1 alpha-2 code (AEP-143 region code), shown as its name in the reader's language. */
  regionCode: string;
  /** Link behind "Get directions" and the address on the contact page. */
  directionsUrl?: string;
  /** Where the contact map puts the company; without it the map stays hidden. */
  coordinates?: { lat: number; lng: number };
}

/** The organization behind the app, as its legal pages, contact page, footer and emails name it. */
export interface CompanyConfig {
  /** The legal name, which the terms, the privacy policy and `{{company}}` in translations use. */
  name: string;
  /** Shown on the contact page, and where requests and tenant removals are reported. */
  email: string;
  phone?: string;
  address?: CompanyAddress;
  /** One line as the legal pages print it, such as "Chamber of Commerce (KvK): 578 25 920". */
  registration?: string;
  vatNumber?: string;
  scheduleCallUrl?: string;
  socialUrl?: string;
  /** A chat room link, such as a matrix.to address. */
  chatUrl?: string;
}

/**
 * A product entity embedded as an id array inside a host product entity. `lifecycle: 'owned'`
 * lets CDC delete embedded rows no live host references; the default 'shared' only strips
 * references to dead rows.
 */
export interface ProductEmbedding<P extends string = string> {
  readonly embeddedProduct: P;
  readonly hostProduct: P;
  readonly hostColumn: string;
  readonly lifecycle?: 'shared' | 'owned';
}

/** A `menuStructure` section: the channel type `C` it lists, and the channel type `S` nested under each of its items. */
export interface MenuStructureItem<C extends string = string, S extends string = C> {
  entityType: C;
  subentityType: S | null;
  /**
   * A subentity membership auto-creates one on the parent, by default with the least-privileged
   * fitting role (`member` where the parent vocabulary has it). `carryRole` keeps the invited
   * role when the parent vocabulary also has it (courseSection `student` to course `student`), and
   * refuses an invitation whose carried role outranks the inviter's own on the parent.
   */
  carryRole?: boolean;
  /** `false`: nobody hides a membership of `entityType`, for a channel that only groups others. On by default. */
  hideable?: boolean;
}

/** All readonly string-array config properties, grouped as one generic parameter so literal types survive. */
export interface ConfigStringArrays {
  entityTypes: readonly string[];
  channelEntityTypes: readonly string[];
  productEntityTypes: readonly string[];
  seenTrackedProductTypes: readonly string[];
  entityActions: readonly string[];
  resourceTypes: readonly string[];
  systemRoles: readonly string[];
  tokenKinds: readonly string[];
  languages: readonly string[];
  uploadTemplateIds: readonly string[];
}

/** The placement surfaces that exist once per app; the rest belong to a channel. */
const singletonSlots = ['account.settings', 'account.preferences', 'home.sections', 'user.profile', 'system.tabs'] as const;

export type SingletonSlot = (typeof singletonSlots)[number];

/** A channel's own placement surfaces; the only ones a channel row can store an arrangement for. */
export type ChannelSlotOf<C extends string> = `${C}.settings` | `${C}.tabs`;

/** Every placement surface of an app whose channel types are `C`. */
export type SlotOf<C extends string> = ChannelSlotOf<C> | SingletonSlot;

/** The app's arrangement of one surface, by placement id. An id that names no placement is skipped: a misspelled or renamed one leaves its placement in view. */
export interface SurfaceArrangement {
  /** Shown first, in this sequence; the other placements follow in their declared `order`. */
  readonly order?: readonly string[];
  /** Left off the surface, `locked` ones included. */
  readonly hidden?: readonly string[];
}

/** How the app navigates; `C` is the app's channel types. */
export interface NavigationConfig<C extends string = string> {
  /** The strip of nav buttons, left on desktop and at the bottom on phones. `false`: the menu stays open beside the page on desktop, and a floating button opens it on phones. */
  navBar: boolean;
  /** `all`: every menu section in one menu. `perOrganization`: one organization at a time, picked with a nav bar button each, or a switcher in the menu header. */
  menu: 'all' | 'perOrganization';
  /** Channel types whose page tabs show in the menu, under the channel, in place of the page header's tab bar. */
  pageTabs: Partial<Record<C, 'menu'>>;
}

/**
 * The config an app must satisfy (`satisfies RequiredConfig` in its default.ts). The generic keeps
 * arrays as literal tuples (`['organization']`, not `readonly string[]`) so Drizzle v1 gets strict enums.
 */
export interface RequiredConfig<T extends ConfigStringArrays = ConfigStringArrays> {
  entityTypes: T['entityTypes'];
  channelEntityTypes: T['channelEntityTypes'];
  productEntityTypes: T['productEntityTypes'];
  seenTrackedProductTypes: T['seenTrackedProductTypes'];
  entityIdColumnKeys: { readonly [K in T['entityTypes'][number] & string]: `${K}Id` };
  entityActions: T['entityActions'];
  resourceTypes: T['resourceTypes'];
  productEmbeddings: readonly ProductEmbedding<T['productEntityTypes'][number] & string>[];
  menuStructure: readonly MenuStructureItem<T['channelEntityTypes'][number] & string>[];
  navigation: NavigationConfig<T['channelEntityTypes'][number] & string>;
  surfaces: Partial<Record<SlotOf<T['channelEntityTypes'][number] & string>, SurfaceArrangement>>;
  attachmentUploadTargets: readonly (T['channelEntityTypes'][number] & string)[];
  memberStatProductTypes: readonly (T['productEntityTypes'][number] & string)[];
  defaultRestrictions: {
    /** Hard caps per tenant on entity types and on machine actors and their keys; 0 = unlimited. */
    quotas: Partial<Record<(T['entityTypes'][number] & string) | 'serviceAccount' | 'apiKey', number>>;
    /** API points per hour per actor; invitation mails per day the tenant sends, new, reminded and reopened alike. 0 lifts either. */
    rateLimits: { apiPointsPerHour: number; invitationMailsPerDay: number };
  };
  selfServiceTenantsPerUser: number;
  tenantKinds: Record<TenantKind, TenantKindConfig<(T['entityTypes'][number] & string) | 'serviceAccount' | 'apiKey'>>;
  demo: DemoConfig;
  retention: RetentionConfig;

  systemRoles: T['systemRoles'];

  tokenKinds: T['tokenKinds'];

  languages: T['languages'];

  uploadTemplateIds: T['uploadTemplateIds'];

  name: string;
  slug: string;
  domain: string;
  description: string;
  keywords: string;
  asciiArt: readonly string[];

  /** The app's one origin, scheme and host; every service URL is a path under it (`servicePaths`). */
  origin: string;
  devAppIndex: number;
  services: Record<string, AppServiceConfig>;
  singleVM: boolean;
  aboutUrl: string;
  statusUrl: string;
  productionUrl: string;
  /** The app's public GitHub repository; the docs link a repository path under its `/blob/main/`. */
  repositoryUrl?: string;
  defaultRedirectPath: string;
  welcomeRedirectPath: string;

  supportEmail: string;
  senderEmail: string;
  securityEmail: string;

  has: HasFlagsConfig;

  enabledAuthStrategies: readonly BaseAuthStrategies[];
  enabledOAuthProviders: readonly BaseOAuthProviders[];
  federations: Record<string, FederationConfig>;
  totp: TotpConfig;
  maxSessionsPerUser: number;

  apiVersion: string;
  cookieVersion: string;
  clientCacheVersion: string;

  apiDescription: string;

  requestLimits: RequestLimitsConfig;
  /** The largest request body the API reads, in bytes, whatever its content type. */
  jsonBodyLimit: number;

  s3: S3ConfigInput;
  /** Origin of the media asset CDN; empty while none is configured. */
  mediaAssetOrigin: string;
  uppy: { defaultRestrictions: UppyRestrictionsConfig };
  localBlobStorage: LocalBlobStorageConfig;

  gleapToken: string;
  mapStyleUrls: { light: string; dark: string };
  /** MapLibre zoom of the contact map: 3 shows Europe, 14 a few streets. */
  mapZoom: number;
  maplePublicIngestKey: string;
  /** Hosts a Web Push subscription endpoint may name; `*.` matches any subdomain. */
  pushServiceHosts: readonly string[];

  theme: ThemeConfig;
  /** Background classes for an avatar or cover without an image, picked per id. */
  placeholderColors: readonly string[];

  defaultLanguage: string;
  /** ISO 3166-1 alpha-2 codes a country field suggests after the one the device's timezone points to. */
  commonRegionCodes: readonly string[];
  listDatePrecision: 'day' | 'minute';

  company: CompanyConfig;

  /** Defaults of `user.userFlags`, a bag the user sets key by key; it gates no entitlement. */
  defaultUserFlags: Record<string, boolean>;

  /** Defaults of `organization.organizationFlags`, a bag anyone who may update the organization sets key by key. Never gate an entitlement on it: that belongs in the tenant's `subscriptionPlan` and `restrictions`, which only system admins write. */
  defaultOrganizationFlags: Record<string, boolean>;

  /**
   * Setup defaults layered under each organization's stored jsonb, read from `organization.setupConfig`. The template
   * ships {}; apps widen the value (e.g. `{ primaryLabels: [...] }`) in their own config. Anyone who may update the
   * organization sets it, so it gates no entitlement.
   */
  defaultSetupConfig: Record<string, unknown>;
}
