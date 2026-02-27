/**
 * App-specific types derived from the merged configuration and entity hierarchy.
 * These types narrow the generic builder types to the concrete app setup.
 */
import { hierarchy, roles } from './default-config';
import { appConfig } from './app-config';

export type { ConfigMode } from './app-config';

/******************************************************************************
 * ENTITY TYPES
 ******************************************************************************/

/** All entities in this app */
export type EntityType = (typeof appConfig.entityTypes)[number];

/** Context entities (entities with memberships only) */
export type ContextEntityType = (typeof appConfig.contextEntityTypes)[number];

/** Product entities aka (user-generated) content (no memberships assigned) */
export type ProductEntityType = (typeof appConfig.productEntityTypes)[number];

/** Parentless product entities (no organization_id) - tenant-scoped only */
export type ParentlessProductEntityType = (typeof appConfig.parentlessProductEntityTypes)[number];

/** Public product entities (parent: null) - accessible without authentication */
export type PublicProductEntityType = (typeof hierarchy.publicAccessTypes)[number];

/** Relatable context entities - context entities that appear as parents of product entities. Used for activities table columns and CDC context extraction. */
export type RelatableContextEntityType = (typeof hierarchy.relatableContextTypes)[number];

/** Resource types that are not entities but have activities logged */
export type ResourceType = (typeof appConfig.resourceTypes)[number];

/** Product entity types tracked for seen/unseen counts */
export type SeenTrackedEntityType = (typeof appConfig.seenTrackedEntityTypes)[number];

/******************************************************************************
 * APP CONFIGURATION TYPES
 ******************************************************************************/

/** Menu sections in the menu structure */
export type MenuSection = {
  entityType: (typeof appConfig.menuStructure)[number]['entityType'];
  subentityType: (typeof appConfig.menuStructure)[number]['subentityType'] | null;
};

/** OAuth providers enabled in this app */
export type EnabledOAuthProvider = (typeof appConfig.enabledOAuthProviders)[number];

/** Upload template IDs */
export type UploadTemplateId = (typeof appConfig.uploadTemplateIds)[number];

/** Language options */
export type Language = (typeof appConfig.languages)[number];

/** User flags */
export type UserFlags = typeof appConfig.defaultUserFlags;

/** Theme options */
export type Theme = keyof typeof appConfig.theme.colors | 'none';

/** Pino log severity levels */
export type Severity = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/** All token types used in the app */
export type TokenType = (typeof appConfig.tokenTypes)[number];

/** System roles available in the app */
export type SystemRole = (typeof appConfig.systemRoles)[number] | null;

/******************************************************************************
 * ENTITY HIERARCHY HELPERS
 ******************************************************************************/

/** Entity roles type - union of all roles from the role registry. */
export type EntityRole = (typeof roles.all)[number];

/** Expected shape for entityIdColumnKeys - must have all entity types as keys with `${EntityType}Id` naming. */
export type EntityIdColumnKeysShape = { readonly [K in EntityType]: `${K}Id` };

/** Entity ID column keys mapping (e.g., { organization: 'organizationId' }) */
export type EntityIdColumnKeys = typeof appConfig.entityIdColumnKeys;

/** Entity ID column key for a specific entity type */
export type EntityIdColumnKey<T extends EntityType> = EntityIdColumnKeys[T];

/** Entity actions that can be performed (CRUD + search) */
export type EntityActionType = (typeof appConfig.entityActions)[number];
