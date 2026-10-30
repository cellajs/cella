export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

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
  /** OIDC issuer; endpoints come from its discovery document. Mode configs point a key at a test issuer. */
  issuer: string;
  /** SAML metadata feed listing the federation's institutions (entity ids, names, logos, domains); optional. */
  idpMetadataUrl?: string;
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
export type BaseOAuthProviders = 'github' | 'google' | 'microsoft';

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
}

export interface AppServiceEndpointConfig {
  enabled?: boolean;
  publicUrl?: string;
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
  maxFileSize: number;
  /** Bytes downloaded files may take on one device, across organizations: the budget of the largest offline files tier. */
  maxTotalSize: number;
  allowedContentTypes: string[];
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

export interface CompanyConfig {
  name: string;
  shortName: string;
  email: string;
  supportEmail: string;
  tel: string;
  streetAddress: string;
  postcode: string;
  city: string;
  country: string;
  registration: string;
  vatNumber: string;
  /** Link behind "Get directions" and the address on the contact page. */
  directionsUrl: string;
  scheduleCallUrl: string;
  socialUrl: string;
  blueskyHandle: string;
  element: string;
  githubUrl: string;
  /** MapLibre zoom of the contact map: 3 shows Europe, 14 a few streets. */
  mapZoom: number;
  coordinates: { lat: number; lng: number };
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

export interface MenuStructureItem<C extends string = string> {
  entityType: C;
  subentityType: C | null;
  /**
   * A subentity membership auto-creates one on the parent, by default with the least-privileged
   * fitting role (`member` where the parent vocabulary has it). `carryRole` keeps the invited
   * role when the parent vocabulary also has it (courseSection `student` to course `student`), and
   * refuses an invitation whose carried role outranks the inviter's own on the parent.
   */
  carryRole?: boolean;
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
  tokenTypes: readonly string[];
  languages: readonly string[];
  uploadTemplateIds: readonly string[];
}

/** The placement surfaces that exist once per app, in the order they are declared; the rest belong to a channel. */
export const singletonSlots = ['account.settings', 'account.preferences', 'home.sections', 'user.profile', 'system.tabs'] as const;

export type SingletonSlot = (typeof singletonSlots)[number];

/** A channel's own placement surfaces; the only ones a channel row can store an arrangement for. */
export type ChannelSlotOf<C extends string> = `${C}.settings` | `${C}.tabs`;

/** Every placement surface of an app whose channel types are `C`. */
export type SlotOf<C extends string> = ChannelSlotOf<C> | SingletonSlot;

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
  /**
   * Placement ids per surface, in display order. A listed surface is total: an id left out has no
   * placement there. An unlisted surface renders every registered placement in its declared order.
   */
  surfaces: Partial<Record<SlotOf<T['channelEntityTypes'][number] & string>, readonly string[]>>;
  attachmentUploadTargets: readonly (T['channelEntityTypes'][number] & string)[];
  memberStatProductTypes: readonly (T['productEntityTypes'][number] & string)[];
  defaultRestrictions: {
    /** Hard caps per tenant on entity types and on machine actors and their keys; 0 = unlimited. */
    quotas: Partial<Record<(T['entityTypes'][number] & string) | 'serviceAccount' | 'apiKey', number>>;
    /** API points per hour per actor; invitation mails per day the tenant sends, new, reminded and reopened alike. 0 lifts either. */
    rateLimits: { apiPointsPerHour: number; invitationMailsPerDay: number };
  };
  selfServiceTenantsPerUser: number;
  retention: RetentionConfig;

  systemRoles: T['systemRoles'];

  tokenTypes: T['tokenTypes'];

  languages: T['languages'];

  uploadTemplateIds: T['uploadTemplateIds'];

  name: string;
  slug: string;
  domain: string;
  description: string;
  keywords: string;

  frontendUrl: string;
  backendUrl: string;
  backendAuthUrl: string;
  yjsUrl: string;

  mcpUrl: string;
  oauthUrl: string;
  devPorts: Record<'frontend' | 'api' | 'cdcHealth' | 'yjs' | 'mcp' | 'oauth' | 'internal' | 'jobs', number>;
  services: Record<string, AppServiceEndpointConfig>;
  singleVM: boolean;
  aboutUrl: string;
  statusUrl: string;
  productionUrl: string;
  defaultRedirectPath: string;
  welcomeRedirectPath: string;

  supportEmail: string;
  senderEmail: string;
  securityEmail: string;

  mode: ConfigMode;
  maintenance: boolean;

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
  matrixURL: string;
  maplePublicIngestKey: string;
  /** Hosts a Web Push subscription endpoint may name; `*.` matches any subdomain. */
  pushServiceHosts: readonly string[];

  theme: ThemeConfig;
  /** Background classes for an avatar or cover without an image, picked per id. */
  placeholderColors: readonly string[];

  defaultLanguage: string;
  /** ISO 3166-1 alpha-2 codes a country field suggests after the one the device's timezone points to. */
  commonCountries: readonly string[];

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
