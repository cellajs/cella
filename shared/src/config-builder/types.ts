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
  /** Whether the institution operates the mailbox it asserts, so a sign-in through it proves the address. */
  addressAuthority: boolean;
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

export interface S3Config extends Required<S3ConfigInput> {}

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

export interface LocalBlobStorageConfig {
  enabled: boolean;
  maxFileSize: number;
  maxTotalSize: number;
  allowedContentTypes: string[];
  excludedContentTypes: string[];
  downloadConcurrency: number;
  downloadRetryAttempts: number;
  uploadRetryAttempts: number;
  uploadRetryDelays: readonly number[];
}

export interface ThemeNavigationConfig {
  hasSidebarTextLabels: boolean;
  sidebarWidthExpanded: string;
  sidebarWidthCollapsed: string;
  sheetPanelWidth: string;
}

export interface ThemeConfig {
  navigation: ThemeNavigationConfig;
  colors: Record<string, string>;
  strokeWidth: number;
  screenSizes: Record<string, string>;
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
  bankAccount: string;
  googleMapsUrl: string;
  scheduleCallUrl: string;
  socialUrl: string;
  blueskyHandle: string;
  element: string;
  githubUrl: string;
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
   * role when the parent vocabulary also has it (courseSection `student` to course `student`).
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

/**
 * The config an app must satisfy (`satisfies RequiredConfig` in its default.ts). The generic keeps
 * arrays as literal tuples (`['organization']`, not `readonly string[]`) so Drizzle v1 gets strict enums.
 */
/** The placement surfaces that exist once per app; the rest belong to a channel. */
export type SingletonSlot = 'account.settings' | 'home.sections' | 'user.profile' | 'system.tabs';

/** A channel's own placement surfaces; the only ones a channel row can store an arrangement for. */
export type ChannelSlotOf<C extends string> = `${C}.settings` | `${C}.tabs`;

/** Every placement surface of an app whose channel types are `C`. */
export type SlotOf<C extends string> = ChannelSlotOf<C> | SingletonSlot;

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
    rateLimits: { apiPointsPerHour: number };
  };

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
  jsonBodyLimit: number;
  fileUploadLimit: number;
  defaultBodyLimit: number;

  s3: S3ConfigInput;
  /** Origin of the media asset CDN; empty while none is configured. */
  mediaAssetOrigin: string;
  uppy: { defaultRestrictions: UppyRestrictionsConfig };
  localBlobStorage: LocalBlobStorageConfig;

  gleapToken: string;
  googleMapsKey: string;
  matrixURL: string;
  maplePublicIngestKey: string;

  themeColor: string;
  theme: ThemeConfig;
  placeholderColors: readonly string[];

  defaultLanguage: string;
  c: { countries: readonly string[]; timezones: readonly string[] };

  company: CompanyConfig;

  defaultUserFlags: Record<string, boolean>;

  defaultOrganizationFlags: Record<string, boolean>;

  // Defaults layered under each organization's stored jsonb. The template ships {}; apps widen
  // the value (e.g. `{ primaryLabels: [...] }`) in their own config.
  defaultSetupConfig: Record<string, unknown>;
}
