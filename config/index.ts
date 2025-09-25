import _default, { Config } from './default';
import development from './development';
import production from './production';
import staging from './staging';
import test from './test';
import tunnel from './tunnel';
import { mergeDeep } from './utils';

/**
 * All entities in this app
 */
export type EntityType = (typeof appConfig.entityTypes)[number];

/**
 * Context entities (entities with memberships only)
 */
export type ContextEntityType = (typeof appConfig.contextEntityTypes)[number];

/**
 * Product entities aka (user-generated) content (no memberships assigned)
 */
export type ProductEntityType = (typeof appConfig.productEntityTypes)[number];

/**
 * Menu sections in the menu structure
 */
export type MenuSection = {
  entityType: ContextEntityType;
  subentityType: ContextEntityType | null;
};

/**
 * OAuth providers enabled in this app
 */
export type EnabledOAuthProvider = (typeof appConfig.enabledOAuthProviders)[number];

/**
 * Upload template IDs
 */
export type UploadTemplateId = (typeof appConfig.uploadTemplateIds)[number];

/**
 * Language options
 */
export type Language = (typeof appConfig.languages)[number];

/**
 * User flags 
 */
export type UserFlags = typeof appConfig.defaultUserFlags

/**
 * Theme options
 */
export type Theme = keyof typeof appConfig.theme.colors | 'none';
/**
 * Severity levels to be used in error handling
 */
export type Severity = keyof typeof appConfig.severityLevels

const configModes = {
  development,
  tunnel,
  staging,
  production,
  test,
} satisfies Record<Config['mode'], unknown>

export type ConfigMode = Config['mode']


const mode  = (process.env.NODE_ENV || 'development') as Config['mode'];
export const appConfig = mergeDeep(_default, configModes[mode]);