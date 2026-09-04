import type { hierarchy, roles } from './config/config.default.ts';
import { appConfig } from './src/config-builder/app-config.ts';

export type EntityType = (typeof appConfig.entityTypes)[number];

export type ChannelEntityType = (typeof appConfig.channelEntityTypes)[number];

/** User-generated content; no memberships are assigned on these. */
export type ProductEntityType = (typeof appConfig.productEntityTypes)[number];

/** Channel entities appearing as product parents; drives activities columns and CDC channel extraction. */
export type RelatableChannelEntityType = (typeof hierarchy.relatableChannelTypes)[number];

/** Not entities, but activities are logged for them. */
export type ResourceType = (typeof appConfig.resourceTypes)[number];

export type SeenTrackedProductType = (typeof appConfig.seenTrackedProductTypes)[number];

// App configuration types

export type MenuSection = {
  entityType: (typeof appConfig.menuStructure)[number]['entityType'];
  subentityType: (typeof appConfig.menuStructure)[number]['subentityType'] | null;
};

export type EnabledOAuthProvider = (typeof appConfig.enabledOAuthProviders)[number];

export type UploadTemplateId = (typeof appConfig.uploadTemplateIds)[number];

export type Language = (typeof appConfig.languages)[number];

export type UserFlags = typeof appConfig.defaultUserFlags;

/** Per-organization feature toggles; keys are declared in the app config. */
export type OrganizationFlags = typeof appConfig.defaultOrganizationFlags;

export type OrganizationSetupConfig = typeof appConfig.defaultSetupConfig;

export type Theme = keyof typeof appConfig.theme.colors | 'none';

export type Severity = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/** Aligned with HTTP methods, minus 'read'. Shared between backend and CDC. */
export const activityActions = ['create', 'update', 'delete'] as const;
export type ActivityAction = (typeof activityActions)[number];

export const activityVerbs = ['created', 'updated', 'deleted'] as const;
export type ActivityVerb = (typeof activityVerbs)[number];

const actionVerbMap = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
} as const satisfies Record<ActivityAction, ActivityVerb>;

export const actionToVerb = (action: ActivityAction): ActivityVerb => actionVerbMap[action];

type TrackedType = EntityType | ResourceType;

/**
 * Event name for any tracked-type change ('user.created', 'membership.updated'). One namespace
 * shared by the activity/CDC stream and the synchronous mutation bus.
 */
export type TrackedEventType = `${TrackedType}.${ActivityVerb}`;

/** Zod enums need a non-empty tuple, so a config declaring no entity or resource type throws here. */
export const trackedEventTypes = ((): readonly [TrackedEventType, ...TrackedEventType[]] => {
  const types = [...appConfig.entityTypes, ...appConfig.resourceTypes].flatMap((type) =>
    activityVerbs.map((verb): TrackedEventType => `${type}.${verb}`),
  );
  const [first, ...rest] = types;
  if (!first) {
    throw new Error('FATAL: trackedEventTypes is empty. Config must declare at least one entity or resource type.');
  }
  return [first, ...rest];
})();

const validEventTypes = new Set<string>(trackedEventTypes);

export function isValidEventType(type: string): type is TrackedEventType {
  return validEventTypes.has(type);
}

export type TokenType = (typeof appConfig.tokenTypes)[number];

export type SystemRole = (typeof appConfig.systemRoles)[number] | null;

// Entity hierarchy helpers

export type EntityRole = (typeof roles.all)[number];

/** For example `{ organization: 'organizationId' }`. */
export type EntityIdColumnKeys = typeof appConfig.entityIdColumnKeys;

export type EntityIdColumnKey<T extends EntityType> = EntityIdColumnKeys[T];

/**
 * Entity types `TS` mapped to their id-column keys, each carrying value type `V`. The one generic
 * behind every "channel id columns" shape: `V` may be a drizzle uuid builder, `string`,
 * `string | null`, a zod field.
 */
export type EntityIdColumns<TS extends EntityType, V> = { [T in TS as EntityIdColumnKey<T>]: V };

// Channel relation types read from the hierarchy's phantom parent/related maps. They generate
// channel-entity id columns on product and channel tables without naming any specific config.
type HierarchyParentMap = typeof hierarchy._parentMap;
type HierarchyRelatedMap = typeof hierarchy._relatedMap;

/** Strict ancestor chain: `AncestorChannelType<'task'>` gives `'project' | 'organization'`. */
export type AncestorChannelType<E extends string> = E extends keyof HierarchyParentMap
  ? HierarchyParentMap[E] extends infer P
    ? P extends string
      ? P | AncestorChannelType<P>
      : never
    : never
  : never;

/** Non-ancestor channels declared via `relatedChannels`. */
export type RelatedChannelType<E extends string> = E extends keyof HierarchyRelatedMap ? HierarchyRelatedMap[E] : never;

type HierarchyNullableMap = typeof hierarchy._nullableMap;

/** Variable-depth rows: `NullableAncestorType<'item'>` gives `'project' | 'courseSection'`. */
export type NullableAncestorType<E extends string> = E extends keyof HierarchyNullableMap
  ? HierarchyNullableMap[E]
  : never;

export type EntityActionType = (typeof appConfig.entityActions)[number];

type ProductEmbedding = (typeof appConfig.productEmbeddings)[number];

/** Which host products need cache updates when an embedded product changes. */
export type PropagationHint = {
  embeddedProduct: ProductEmbedding['embeddedProduct'];
  hostProduct: ProductEmbedding['hostProduct'];
  hostColumn: ProductEmbedding['hostColumn'];
  update: string[];
  remove: string[];
};
