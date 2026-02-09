/**
 * Shared package - Main barrel file
 *
 * Re-exports configuration, entity hierarchy, and utility functions.
 */
import type { RequiredConfig } from './src/builder/types';
import _default, { hierarchy, roles } from './default-config';
import development from './development-config';
import production from './production-config';
import staging from './staging-config';
import test from './test-config';
import tunnel from './tunnel-config';
import { mergeDeep } from './utils';

/******************************************************************************
 * RE-EXPORTS FROM BUILDER
 ******************************************************************************/

// Entity hierarchy types and functions
export type {
  ContextEntityView,
  EntityHierarchy,
  EntityKind,
  EntityView,
  ProductEntityView,
  RoleFromRegistry,
  UserEntityView,
  PublicAction,
  PublicAccessConfig,
  PublicAccessSource,
  PublicAccessInherited,
} from './src/builder/entity-hierarchy';
export {
  createEntityHierarchy,
  createRoleRegistry,
} from './src/builder/entity-hierarchy';

// Config types
export type { RequestLimitsConfig, RequiredConfig, S3Config } from './src/builder/types';

/******************************************************************************
 * RE-EXPORTS FROM UTILS
 ******************************************************************************/

export { hasKey, recordFromKeys, identityRecord } from './utils';

/******************************************************************************
 * RE-EXPORTS FROM HIERARCHY
 ******************************************************************************/

export { hierarchy, roles } from './default-config';

/******************************************************************************
 * ENTITY GUARD FUNCTIONS (bound to app hierarchy)
 ******************************************************************************/

import {
  getContextRoles as _getContextRoles,
  isContextEntity as _isContextEntity,
  isProductEntity as _isProductEntity,
  isPublicProductEntity as _isPublicProductEntity,
} from './src/builder/entity-guards';

/** Get roles for a context entity. */
export function getContextRoles(contextType: string): readonly string[] {
  return _getContextRoles(hierarchy, contextType);
}

/** Check if entity type is a context entity (type guard). */
export function isContextEntity(entityType: string): entityType is ContextEntityType {
  return _isContextEntity(hierarchy, entityType);
}

/** Check if entity type is a product entity (type guard). */
export function isProductEntity(entityType: string | null | undefined): entityType is ProductEntityType {
  return _isProductEntity(hierarchy, entityType);
}

/**
 * Check if entity type has public access configured in hierarchy.
 * This checks whether the entity CAN be public (has publicAccess config),
 * not whether a specific row IS public.
 */
export function isPublicProductEntity(entityType: string): boolean {
  return _isPublicProductEntity(hierarchy, entityType);
}

// TODO-007: rename config to shared and all default to default-config.ts and developent to development-config.ts etc
// TODO-007: split this file in a pure barrel, a src/builder/types.ts file for config build types, and a types.ts file for external types.
//  THe existing types.ts file should be merged with src/builder/types.ts
//  In this src/builder we also put entity-hierarchy, entity-guards
//  this way, in root we only have the

/******************************************************************************
 * HELPER TYPES FOR ENTITY HIERARCHY
 ******************************************************************************/

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
 * Parentless product entities (no organization_id) - tenant-scoped only
 */
export type ParentlessProductEntityType = (typeof appConfig.parentlessProductEntityTypes)[number];

/**
 * Public product entities (parent: null) - accessible without authentication
 */
export type PublicProductEntityType = (typeof hierarchy.publicAccessTypes)[number];

/**
 * Relatable context entities - context entities that appear as parents of product entities.
 * Used for activities table columns and CDC context extraction.
 */
export type RelatableContextEntityType = (typeof hierarchy.relatableContextTypes)[number];

/**
 * Resource types that are not entities but have activities logged
 */
export type ResourceType = (typeof appConfig.resourceTypes)[number];

/**
 * Menu sections in the menu structure
 */
export type MenuSection = {
  entityType: (typeof appConfig.menuStructure)[number]['entityType'];
  subentityType: (typeof appConfig.menuStructure)[number]['subentityType'] | null;
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
export type UserFlags = typeof appConfig.defaultUserFlags;

/**
 * Theme options
 */
export type Theme = keyof typeof appConfig.theme.colors | 'none';

/** Pino log severity levels */
export type Severity = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * All token types used in the app
 */
export type TokenType = (typeof appConfig.tokenTypes)[number];

/**
 * System roles available in the app
 */
export type SystemRole = (typeof appConfig.systemRoles)[number] | null;

/******************************************************************************
 * ENTITY HIERARCHY HELPERS (delegating to hierarchy instance)
 ******************************************************************************/

/**
 * Entity roles type - union of all roles from the role registry.
 */
export type EntityRole = (typeof roles.all)[number];

/**
 * Expected shape for entityIdColumnKeys - must have all entity types as keys.
 * Uses the `${EntityType}Id` naming convention.
 */
export type EntityIdColumnKeysShape = { readonly [K in EntityType]: `${K}Id` };

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
 *****************************************************************************/

type Config = typeof _default;
const configModes = { development, tunnel, staging, production, test } satisfies Record<Config['mode'], unknown>;

export type ConfigMode = Config['mode'];

const mode = (process.env.NODE_ENV || 'development') as Config['mode'];

/**
 * Merged app configuration which combines default config with environment-specific overrides.
 * Type is preserved from _default to maintain literal types for Drizzle v1 strict enum typing.
 */
export const appConfig: Config = mergeDeep(_default, configModes[mode]);

// Compile-time validation that Config satisfies RequiredConfig.
// If Config doesn't extend RequiredConfig, this will cause a type error.
((_: RequiredConfig) => {})(null as unknown as Config);

/******************************************************************************
 * COMPILE-TIME VALIDATION
 * Ensures appConfig arrays match the hierarchy builder.
 ******************************************************************************/

// Validate entityIdColumnKeys has all entity types as keys with correct naming
type ExpectedIdColumnKeys = { readonly [K in EntityType]: `${K}Id` };
const _entityIdKeysCheck: ExpectedIdColumnKeys = appConfig.entityIdColumnKeys;
void _entityIdKeysCheck;

// Validate entityTypes matches hierarchy.allTypes (bi-directional type check)
type HierarchyEntityType = (typeof hierarchy.allTypes)[number];
const _entityTypesMatch1: EntityType extends HierarchyEntityType ? true : false = true;
const _entityTypesMatch2: HierarchyEntityType extends EntityType ? true : false = true;
void _entityTypesMatch1;
void _entityTypesMatch2;

// Validate contextEntityTypes matches hierarchy.contextTypes
type HierarchyContextType = (typeof hierarchy.contextTypes)[number];
const _contextTypesMatch1: ContextEntityType extends HierarchyContextType ? true : false = true;
const _contextTypesMatch2: HierarchyContextType extends ContextEntityType ? true : false = true;
void _contextTypesMatch1;
void _contextTypesMatch2;

// Validate productEntityTypes matches hierarchy.productTypes
type HierarchyProductType = (typeof hierarchy.productTypes)[number];
const _productTypesMatch1: ProductEntityType extends HierarchyProductType ? true : false = true;
const _productTypesMatch2: HierarchyProductType extends ProductEntityType ? true : false = true;
void _productTypesMatch1;
void _productTypesMatch2;

// Validate parentlessProductEntityTypes matches hierarchy.parentlessProductTypes
type HierarchyParentlessProductType = (typeof hierarchy.parentlessProductTypes)[number];
const _parentlessProductTypesMatch1: ParentlessProductEntityType extends HierarchyParentlessProductType
  ? true
  : false = true;
const _parentlessProductTypesMatch2: HierarchyParentlessProductType extends ParentlessProductEntityType
  ? true
  : false = true;
void _parentlessProductTypesMatch1;
void _parentlessProductTypesMatch2;
