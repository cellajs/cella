export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export type ConfigMode = 'development' | 'tunnel' | 'staging' | 'production' | 'test';
export type BaseAuthStrategies = 'passkey' | 'oauth' | 'totp' | 'magic';
export type BaseOAuthProviders = 'github' | 'google' | 'microsoft';

/** Input S3 config: only host and region are required, rest derived from slug in app-config */
export interface S3ConfigInput {
  region: string;
  host: string;
  publicBucket?: string;
  privateBucket?: string;
  publicCDNUrl?: string;
  privateCDNUrl?: string;
}

/** Resolved S3 config with all fields present after derivation */
export interface S3Config extends Required<S3ConfigInput> {}

export interface RequestLimitsConfig {
  default: number;
  [key: string]: number;
}

export interface HasFlagsConfig {
  pwa: boolean;
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

export interface MenuStructureItem {
  entityType: string;
  subentityType: string | null;
  /**
   * When a subentity membership is created, an associated membership on the parent entity is
   * auto-created. By default it gets the least-privileged fitting role (`member` when the parent
   * vocabulary has it). Set `carryRole` to preserve the invited role when it is valid in the
   * parent's vocabulary (e.g. courseSection `student` → course `student`).
   */
  carryRole?: boolean;
}

/** All readonly string-array config properties, grouped as one generic parameter so literal types survive. */
export interface ConfigStringArrays {
  entityTypes: readonly string[];
  channelEntityTypes: readonly string[];
  productEntityTypes: readonly string[];
  seenTrackedEntityTypes: readonly string[];
  entityActions: readonly string[];
  resourceTypes: readonly string[];
  systemRoles: readonly string[];
  tokenTypes: readonly string[];
  languages: readonly string[];
  uploadTemplateIds: readonly string[];
}

/**
 * The config a fork must satisfy (`satisfies RequiredConfig` in its default.ts). The generic keeps
 * arrays as literal tuples (`['organization']`, not `readonly string[]`) so Drizzle v1 gets strict enums.
 */
export interface RequiredConfig<T extends ConfigStringArrays = ConfigStringArrays> {
  // Entity data model - use T['key'] to preserve literal types
  entityTypes: T['entityTypes'];
  channelEntityTypes: T['channelEntityTypes'];
  productEntityTypes: T['productEntityTypes'];
  seenTrackedEntityTypes: T['seenTrackedEntityTypes'];
  entityIdColumnKeys: { readonly [K in T['entityTypes'][number] & string]: `${K}Id` };
  entityActions: T['entityActions'];
  resourceTypes: T['resourceTypes'];
  entityEmbeddings: readonly {
    readonly embeddedEntity: T['productEntityTypes'][number] & string;
    readonly hostEntity: T['productEntityTypes'][number] & string;
    readonly hostColumn: string;
  }[];
  menuStructure: readonly MenuStructureItem[];
  defaultRestrictions: {
    quotas: Record<string, number>;
    rateLimits: { apiPointsPerHour: number };
  };

  // System roles
  systemRoles: T['systemRoles'];

  // Authentication
  tokenTypes: T['tokenTypes'];

  // Localization
  languages: T['languages'];

  // Storage & uploads
  uploadTemplateIds: T['uploadTemplateIds'];

  // App identity
  name: string;
  slug: string;
  domain: string;
  description: string;
  keywords: string;

  // URLs & endpoints
  frontendUrl: string;
  backendUrl: string;
  backendAuthUrl: string;
  yjsUrl: string;

  mcpUrl: string;
  services: Record<string, AppServiceEndpointConfig>;
  // Cost escape hatch: backend (MODE=api) also boots every enabled service
  // in-process when true. Default false keeps the split (one service/process).
  singleVM: boolean;
  aboutUrl: string;
  statusUrl: string;
  productionUrl: string;
  defaultRedirectPath: string;
  welcomeRedirectPath: string;

  // Email
  supportEmail: string;
  senderEmail: string;
  securityEmail: string;

  // Mode & flags
  mode: ConfigMode;
  maintenance: boolean;

  // Feature flags (in-app UX/behavior toggles)
  has: HasFlagsConfig;

  // Authentication
  enabledAuthStrategies: readonly BaseAuthStrategies[];
  enabledOAuthProviders: readonly BaseOAuthProviders[];
  totpConfig: TotpConfig;
  /** Per-user concurrent regular-session cap; oldest beyond it are evicted on sign-in. */
  maxSessionsPerUser: number;

  // Versioning
  apiVersion: string;
  cookieVersion: string;
  clientCacheVersion: string;

  // API configuration
  apiDescription: string;

  // Request limits
  requestLimits: RequestLimitsConfig;
  jsonBodyLimit: number;
  fileUploadLimit: number;
  defaultBodyLimit: number;

  // Storage & uploads
  s3: S3ConfigInput;
  uppy: { defaultRestrictions: UppyRestrictionsConfig };
  localBlobStorage: LocalBlobStorageConfig;

  // Third-party services
  gleapToken: string;
  googleMapsKey: string;
  matrixURL: string;
  maplePublicIngestKey: string;

  // Theming & UI
  themeColor: string;
  theme: ThemeConfig;
  placeholderColors: readonly string[];

  // Localization
  defaultLanguage: string;
  c: { countries: readonly string[]; timezones: readonly string[] };

  // Company details
  company: CompanyConfig;

  // User defaults
  defaultUserFlags: Record<string, boolean>;
}
