import type { Config, EntityKind, ProductEntityConfig } from './types';
import _default from './default';
import development from './development';
import production from './production';
import staging from './staging';
import test from './test';
import tunnel from './tunnel';
import { hasKey, mergeDeep } from './utils';

// Re-export types for external use
export type { EntityConfigEntry, EntityKind, GenerateScript, GenerateScriptType, ProductEntityConfig } from './types';
export { hasKey } from './utils';

/******************************************************************************
 * HELPER TYPES FOR ENTITY CONFIG
 ******************************************************************************/

/**
 * Extract all ancestor entity types from entityConfig.
 * Collects all unique values from product entity `ancestors` arrays.
 */
type EntityConfigAncestors<T extends Record<string, { kind: string; ancestors?: readonly string[] }>> = {
  [K in keyof T]: T[K] extends { kind: 'product'; ancestors: readonly (infer A)[] } ? A : never;
}[keyof T] &
  string;

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
 * Relatable context entities - derived from ancestors arrays in entityConfig.
 * These are context entities that appear in product entity ancestor chains.
 * Used for activities table columns and CDC context extraction.
 */
export type RelatableContextEntityType = EntityConfigAncestors<typeof appConfig.entityConfig>;

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
export type SystemRole = (typeof appConfig.systemRoles)[number];

/******************************************************************************
 * ENTITY CONFIG HELPERS
 ******************************************************************************/

/**
 * Compute all unique entity roles from entityConfig (union of all context entity roles).
 * Used for DB enum and validation.
 */
function computeAllEntityRoles(): [string, ...string[]] {
  const roles = new Set<string>();
  for (const key of Object.keys(_default.entityConfig)) {
    const entry = _default.entityConfig[key as keyof typeof _default.entityConfig];
    if (entry.kind === 'context') {
      for (const role of entry.roles) {
        roles.add(role);
      }
    }
  }
  const arr = [...roles];
  if (arr.length === 0) throw new Error('No entity roles defined in entityConfig');
  return arr as [string, ...string[]];
}

/**
 * All entity roles across all context entities (for DB enum).
 */
export const allEntityRoles = computeAllEntityRoles();

/**
 * Entity roles type - union of all roles from entityConfig.
 * Extracts role union from context entities that have a roles array.
 */
export type EntityRole = {
  [K in keyof typeof _default.entityConfig]: (typeof _default.entityConfig)[K] extends { roles: readonly (infer R)[] }
    ? R
    : never;
}[keyof typeof _default.entityConfig];

/**
 * Check if a role is valid for a specific context type.
 */
export function isValidRoleForContext(role: string, contextType: string): boolean {
  return getContextRoles(contextType).includes(role);
}

/**
 * Get the kind of an entity ('user', 'context', or 'product').
 */
export function getEntityKind(entityType: string): EntityKind | undefined {
  if (!hasKey(appConfig.entityConfig, entityType)) return undefined;
  return appConfig.entityConfig[entityType].kind;
}

/**
 * Get ancestors for an entity (ordered most-specific first).
 * For context entities, returns parent chain. For products, returns ancestors array.
 */
export function getEntityAncestors(entityType: string): readonly string[] {
  if (!hasKey(appConfig.entityConfig, entityType)) return [];
  const entry = appConfig.entityConfig[entityType];
  if (entry.kind === 'product') return entry.ancestors;
  if (entry.kind === 'context' && entry.parent) return [entry.parent];
  return [];
}

/**
 * Get roles for a context entity.
 */
export function getContextRoles(contextType: string): readonly string[] {
  if (!hasKey(appConfig.entityConfig, contextType)) return [];
  const entry = appConfig.entityConfig[contextType];
  if (entry.kind === 'context') return entry.roles;
  return [];
}

/**
 * Check if entity type is a context entity.
 */
export function isContextEntity(entityType: string): boolean {
  return getEntityKind(entityType) === 'context';
}

/**
 * Check if entity type is a product entity.
 */
export function isProductEntity(entityType: string): boolean {
  return getEntityKind(entityType) === 'product';
}

/**
 * Check if entity type is a realtime entity (supports SSE notifications).
 */
export function isRealtimeEntity(entityType: string | null | undefined): entityType is RealtimeEntityType {
  return !!entityType && appConfig.realtimeEntityTypes.includes(entityType as RealtimeEntityType);
}

/**
 * Get product entity config with proper typing.
 * Returns undefined if not a product entity.
 */
export function getProductEntityConfig(
  entityType: string,
): ProductEntityConfig | undefined {
  if (!hasKey(appConfig.entityConfig, entityType)) return undefined;
  const entry = appConfig.entityConfig[entityType];
  return entry.kind === 'product' ? entry : undefined;
}

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

/******************************************************************************
 * CONFIG MERGING
 ******************************************************************************/

const configModes = {
  development,
  tunnel,
  staging,
  production,
  test,
} satisfies Record<Config['mode'], unknown>

export type ConfigMode = Config['mode']

/**
 * Derive relatable context entity types from entityConfig at runtime.
 * Collects all unique ancestor values from product entities.
 */
function deriveRelatableContextEntityTypes<
  T extends Record<string, { kind: string; ancestors?: readonly string[] }>,
>(entityConfig: T): EntityConfigAncestors<T>[] {
  const ancestors = new Set<string>();

  for (const config of Object.values(entityConfig)) {
    if (config.kind === 'product' && 'ancestors' in config && Array.isArray(config.ancestors)) {
      for (const ancestor of config.ancestors) {
        ancestors.add(ancestor);
      }
    }
  }

  return [...ancestors] as EntityConfigAncestors<T>[];
}

const mode = (process.env.NODE_ENV || 'development') as Config['mode'];
export const appConfig = mergeDeep(_default, configModes[mode]);

/**
 * Relatable context entity types - derived from ancestors arrays in entityConfig.
 * Computed at runtime by collecting all unique ancestor values from product entities.
 */
export const relatableContextEntityTypes = deriveRelatableContextEntityTypes(appConfig.entityConfig);