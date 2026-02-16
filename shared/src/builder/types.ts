/******************************************************************************
 * CONFIG BUILDER TYPES
 * Types for building and validating configuration.
 * Includes both external config interface and hierarchy-derived types.
 ******************************************************************************/

/******************************************************************************
 * DEEP PARTIAL UTILITY
 ******************************************************************************/

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

/******************************************************************************
 * CONFIG MODE & BASE TYPES
 ******************************************************************************/

export type ConfigMode = 'development' | 'production' | 'tunnel' | 'test' | 'staging';
export type BaseAuthStrategies = 'password' | 'passkey' | 'oauth' | 'totp';
export type BaseOAuthProviders = 'github' | 'google' | 'microsoft';

/******************************************************************************
 * CONFIG SUB-TYPES
 ******************************************************************************/

export interface S3Config {
  bucketPrefix?: string;
  publicBucket: string;
  privateBucket: string;
  zipBucket?: string;
  region: string;
  host: string;
  privateCDNUrl?: string;
  publicCDNUrl?: string;
}

export interface RequestLimitsConfig {
  default: number;
  [key: string]: number;
}

export interface FeatureFlagsConfig {
  pwa: boolean;
  registrationEnabled: boolean;
  waitlist: boolean;
  uploadEnabled: boolean;
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
  blueskyUrl: string;
  blueskyHandle: string;
  element: string;
  githubUrl: string;
  mapZoom: number;
  coordinates: { lat: number; lng: number };
}

export interface MenuStructureItem {
  entityType: string;
  subentityType: string | null;
}

/******************************************************************************
 * CONFIG STRING ARRAYS
 * Type for all readonly string array properties in config.
 * Used as a single generic parameter to preserve literal types.
 ******************************************************************************/

export interface ConfigStringArrays {
  entityTypes: readonly string[];
  contextEntityTypes: readonly string[];
  productEntityTypes: readonly string[];
  parentlessProductEntityTypes: readonly string[];
  entityActions: readonly string[];
  resourceTypes: readonly string[];
  systemRoles: readonly string[];
  tokenTypes: readonly string[];
  languages: readonly string[];
  uploadTemplateIds: readonly string[];
}

/******************************************************************************
 * REQUIRED CONFIG
 * Complete config type that forks must satisfy.
 * Use `satisfies RequiredConfig` in fork's default.ts for type enforcement.
 *
 * Generic parameter preserves literal types for Drizzle v1 strict enum typing.
 * When accessed via appConfig, arrays remain as literal tuples like ['organization']
 * instead of being widened to readonly string[].
 ******************************************************************************/

export interface RequiredConfig<T extends ConfigStringArrays = ConfigStringArrays> {
  // Entity data model - use T['key'] to preserve literal types
  entityTypes: T['entityTypes'];
  contextEntityTypes: T['contextEntityTypes'];
  productEntityTypes: T['productEntityTypes'];
  parentlessProductEntityTypes: T['parentlessProductEntityTypes'];
  entityIdColumnKeys: Record<string, string>;
  entityActions: T['entityActions'];
  resourceTypes: T['resourceTypes'];
  menuStructure: readonly MenuStructureItem[];
  defaultOrganizationRestrictions: Record<string, number>;

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
  aboutUrl: string;
  statusUrl: string;
  productionUrl: string;
  defaultRedirectPath: string;
  welcomeRedirectPath: string;

  // Email
  supportEmail: string;
  notificationsEmail: string;

  // Mode & flags
  mode: ConfigMode;
  debug: boolean;
  maintenance: boolean;
  cookieVersion: string;

  // Feature flags
  has: FeatureFlagsConfig;

  // Authentication
  enabledAuthStrategies: readonly BaseAuthStrategies[];
  enabledOAuthProviders: readonly BaseOAuthProviders[];
  totpConfig: TotpConfig;

  // API configuration
  apiVersion: string;
  apiDescription: string;

  // Request limits
  requestLimits: RequestLimitsConfig;
  jsonBodyLimit: number;
  fileUploadLimit: number;
  defaultBodyLimit: number;

  // Storage & uploads
  s3: S3Config;
  uppy: { defaultRestrictions: UppyRestrictionsConfig };
  localBlobStorage: LocalBlobStorageConfig;

  // Third-party services
  paddleToken: string;
  paddlePriceIds: Record<string, string>;
  sentryDsn: string;
  sentSentrySourceMaps: boolean;
  gleapToken: string;
  googleMapsKey: string;
  matrixURL: string;

  // Theming & UI
  themeColor: string;
  theme: ThemeConfig;
  placeholderColors: readonly string[];

  // Localization
  defaultLanguage: string;
  common: { countries: readonly string[]; timezones: readonly string[] };

  // Company details
  company: CompanyConfig;

  // User defaults
  defaultUserFlags: Record<string, boolean>;
}

/**
 * Shorthand for RequiredConfig with all defaults.
 * Use this when you don't need to preserve specific literal types.
 */
export type BaseRequiredConfig = RequiredConfig;
