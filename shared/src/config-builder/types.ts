export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export type ConfigMode = 'development' | 'tunnel' | 'staging' | 'production' | 'test';
export type BaseAuthStrategies = 'passkey' | 'oauth' | 'totp' | 'magic';
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
  defaultRestrictions: {
    quotas: Record<string, number>;
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
  devPorts: { frontend: number; api: number; cdcHealth: number; yjs: number; mcp: number };
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
