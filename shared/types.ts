import { hierarchy, roles } from './config/config.default';
import { appConfig } from './src/config-builder/app-config';

// Entity types

/** All entities in this app */
export type EntityType = (typeof appConfig.entityTypes)[number];

/** Channel entities (entities with memberships only) */
export type ChannelEntityType = (typeof appConfig.channelEntityTypes)[number];

/** Product entities: user-generated content (no memberships assigned) */
export type ProductEntityType = (typeof appConfig.productEntityTypes)[number];

/** Relatable channel entities - channel entities that appear as parents of product entities. Used for activities table columns and CDC context extraction. */
export type RelatableChannelEntityType = (typeof hierarchy.relatableChannelTypes)[number];

/** Resource types that are not entities but have activities logged */
export type ResourceType = (typeof appConfig.resourceTypes)[number];

/** Product entity types tracked for seen/unseen counts */
export type SeenTrackedProductType = (typeof appConfig.seenTrackedProductTypes)[number];

// App configuration types

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

/** Organization flags (per-org feature toggles; keys declared in fork config) */
export type OrganizationFlags = typeof appConfig.defaultOrganizationFlags;

/** Theme options */
export type Theme = keyof typeof appConfig.theme.colors | 'none';

/** Pino log severity levels */
export type Severity = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/** Activity actions aligned with HTTP methods (excluding 'read'). Shared between backend and CDC. */
export const activityActions = ['create', 'update', 'delete'] as const;
export type ActivityAction = (typeof activityActions)[number];

/** Past-tense verbs for activity event types, aligned with activityActions. */
export const activityVerbs = ['created', 'updated', 'deleted'] as const;
export type ActivityVerb = (typeof activityVerbs)[number];

/** Mapping from action to verb for event type construction. */
const actionVerbMap = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
} as const satisfies Record<ActivityAction, ActivityVerb>;

export const actionToVerb = (action: ActivityAction): ActivityVerb => actionVerbMap[action];

/** All tracked types (entities + resources) for activity events. */
type TrackedType = EntityType | ResourceType;

/** Strongly typed activity event type, e.g. 'user.created', 'membership.updated'. */
export type ActivityEventType = `${TrackedType}.${ActivityVerb}`;

/** Runtime array of all valid activity event types for schema enum constraints. */
export const activityEventTypes = [...appConfig.entityTypes, ...appConfig.resourceTypes].flatMap(
  (type) => activityVerbs.map((verb) => `${type}.${verb}`),
) as unknown as readonly [ActivityEventType, ...ActivityEventType[]];

/** Set of valid event types for runtime validation. */
const validEventTypes = new Set<string>(activityEventTypes);

/** Type predicate to check if a string is a valid ActivityEventType. */
export function isValidEventType(type: string): type is ActivityEventType {
  return validEventTypes.has(type);
}

/** All token types used in the app */
export type TokenType = (typeof appConfig.tokenTypes)[number];

/** System roles available in the app */
export type SystemRole = (typeof appConfig.systemRoles)[number] | null;

// Entity hierarchy helpers

/** Entity roles type - union of all roles from the role registry. */
export type EntityRole = (typeof roles.all)[number];

/** Entity ID column keys mapping (e.g., { organization: 'organizationId' }) */
export type EntityIdColumnKeys = typeof appConfig.entityIdColumnKeys;

/** Entity ID column key for a specific entity type */
export type EntityIdColumnKey<T extends EntityType> = EntityIdColumnKeys[T];

/**
 * Maps a set of entity types `TS` to their id-column keys (via {@link EntityIdColumnKey}), each
 * carrying value type `V`. The single generic behind every "context id columns" shape: pass the
 * entity-type subset and the column value; a drizzle uuid builder, `string`, `string | null`, a
 * zod field, etc.
 */
export type EntityIdColumns<TS extends EntityType, V> = { [T in TS as EntityIdColumnKey<T>]: V };

// Context relation types derived from the hierarchy's phantom parent/related maps. They
// generate context-entity id columns on product/context tables in a fork-agnostic way.

/** Type-level map of each entity to its strict parent (null = root). */
type HierarchyParentMap = typeof hierarchy._parentMap;

/** Type-level map of each entity to the union of its related (non-ancestor) contexts. */
type HierarchyRelatedMap = typeof hierarchy._relatedMap;

/**
 * Strict ancestor context chain for an entity, resolved recursively via the parent map.
 * Example: `AncestorChannelType<'task'>` → `'project' | 'organization'`.
 */
export type AncestorChannelType<E extends string> = E extends keyof HierarchyParentMap
  ? HierarchyParentMap[E] extends infer P
    ? P extends string
      ? P | AncestorChannelType<P>
      : never
    : never
  : never;

/**
 * The root channel entity type: the parentless context (no ancestors), e.g. `'organization'`.
 * Derived from the hierarchy so forks that rename/restructure the root don't need code changes.
 * Root context identifiers use `EntityIdColumnKey<RootChannelType>`.
 */
export type RootChannelType = {
  [K in ChannelEntityType]: [AncestorChannelType<K>] extends [never] ? K : never;
}[ChannelEntityType];

/**
 * Related (non-ancestor) context types declared for an entity via `relatedChannels`.
 * Example (Raak): `RelatedChannelType<'chat'>` → `'workspace' | 'project'`.
 */
export type RelatedChannelType<E extends string> = E extends keyof HierarchyRelatedMap
  ? HierarchyRelatedMap[E]
  : never;

/** Type-level map of each product to its nullable-ancestor union. */
type HierarchyNullableMap = typeof hierarchy._nullableMap;

/**
 * Ancestors declared nullable for a product via `nullableAncestors` (variable-depth rows).
 * Example (ProjectCampus): `NullableAncestorType<'item'>` → `'project' | 'courseSection'`.
 */
export type NullableAncestorType<E extends string> = E extends keyof HierarchyNullableMap
  ? HierarchyNullableMap[E]
  : never;

/** Entity actions that can be performed (CRUD + search) */
export type EntityActionType = (typeof appConfig.entityActions)[number];

// Embedding propagation types

/** Single product embedding relationship derived from config */
type ProductEmbedding = (typeof appConfig.productEmbeddings)[number];

/** Hint describing which host products need cache updates when an embedded product changes */
export type PropagationHint = {
  embeddedProduct: ProductEmbedding['embeddedProduct'];
  hostProduct: ProductEmbedding['hostProduct'];
  hostColumn: ProductEmbedding['hostColumn'];
  update: string[];
  remove: string[];
};
