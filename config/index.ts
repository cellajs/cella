import type { Config } from './types';
import _default from './default';
import development from './development';
import production from './production';
import staging from './staging';
import test from './test';
import tunnel from './tunnel';
import { mergeDeep } from './utils';

// Re-export types for external use
export type { GenerateScript, GenerateScriptType } from './types';

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
 * Offline entities that support offline transactions
 */
export type OfflineEntityType = (typeof appConfig.offlineEntityTypes)[number];

/**
 * Realtime entities that support realtime & offline transactions
 */
export type RealtimeEntityType = (typeof appConfig.realtimeEntityTypes)[number];

/**
 * Menu sections in the menu structure
 */
export type MenuSection = {
  entityType: typeof appConfig.menuStructure[number]['entityType'];
  subentityType: typeof appConfig.menuStructure[number]['subentityType'] | null;
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

/**
 * All token types used in the app
 */
export type TokenType = (typeof appConfig.tokenTypes)[number]

/**
 * System roles available in the app
 */
export type SystemRole = (typeof appConfig.roles.systemRoles)[number];

/**
 * Entity roles available in the app (e.g., 'member', 'admin')
 */
export type EntityRole = (typeof appConfig.roles.entityRoles)[number];

/**
 * Entity ID column keys mapping (e.g., { organization: 'organizationId' })
 */
export type EntityIdColumnKeys = typeof appConfig.entityIdColumnKeys;

/**
 * Entity ID column key for a specific entity type
 */
export type EntityIdColumnKey<T extends EntityType> = EntityIdColumnKeys[T];

/**
 * Entity actions that can be performed (CRUD + search)
 */
export type EntityActionType = (typeof appConfig.entityActions)[number];

const configModes = {
  development,
  tunnel,
  staging,
  production,
  test,
} satisfies Record<Config['mode'], unknown>

export type ConfigMode = Config['mode']


const mode = (process.env.NODE_ENV || 'development') as Config['mode'];
export const appConfig = mergeDeep(_default, configModes[mode]);