import type { hierarchy, roles } from './config/config.default.ts';
import { appConfig } from './src/config-builder/app-config.ts';
import type { MenuStructureItem } from './src/config-builder/types.ts';

export type EntityType = (typeof appConfig.entityTypes)[number];

export type ChannelEntityType = (typeof appConfig.channelEntityTypes)[number];

/** User-generated content; no memberships are assigned on these. */
export type ProductEntityType = (typeof appConfig.productEntityTypes)[number];

/** Not entities, but activities are logged for them. */
export type ResourceType = (typeof appConfig.resourceTypes)[number];

export type SeenTrackedProductType = (typeof appConfig.seenTrackedProductTypes)[number];

/** A collaborative document: its entity, and the tenant its rows are stored and read under. */
export interface YjsDocKey {
  entityType: ProductEntityType;
  entityId: string;
  tenantId: string;
}

/** A document key plus its organization: the one its rows carry, and its token and HTTP routes check. */
export interface YjsDocScope extends YjsDocKey {
  organizationId: string;
}

// App configuration types

type MenuStructureEntry = (typeof appConfig.menuStructure)[number];

/** A section of the app's menu structure, typed by the channel types its config names at each level. */
export type MenuSection = MenuStructureItem<MenuStructureEntry['entityType'], NonNullable<MenuStructureEntry['subentityType']>>;

/** `appConfig.menuStructure` read as {@link MenuSection}s, whose optional fields a config literal may leave out. */
export const menuSections: readonly MenuSection[] = appConfig.menuStructure;

export type EnabledOAuthProvider = (typeof appConfig.enabledOAuthProviders)[number];
/** A federation in `appConfig.federations`: a session strategy, an identities provider slug and an env prefix. */
export type FederationKey = keyof typeof appConfig.federations & string;

export type UploadTemplateId = (typeof appConfig.uploadTemplateIds)[number];

export type Language = (typeof appConfig.languageCodes)[number];

export type UserFlags = typeof appConfig.defaultUserFlags;

/** Per-organization feature toggles; keys are declared in the app config. */
export type OrganizationFlags = typeof appConfig.defaultOrganizationFlags;

export type OrganizationSetupConfig = typeof appConfig.defaultSetupConfig;

export type Theme = keyof typeof appConfig.theme.colors | 'none';

/** Log and error severities, most severe first. */
export const severityLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type Severity = (typeof severityLevels)[number];

/** Aligned with HTTP methods, minus 'read'. Shared between backend and CDC. */
export const activityActions = ['create', 'update', 'delete'] as const;
export type ActivityAction = (typeof activityActions)[number];

const activityVerbs = ['created', 'updated', 'deleted'] as const;
export type ActivityVerb = (typeof activityVerbs)[number];

const actionVerbMap = { create: 'created', update: 'updated', delete: 'deleted' } as const satisfies Record<ActivityAction, ActivityVerb>;

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

export type TokenKind = (typeof appConfig.tokenKinds)[number];

// Entity hierarchy helpers

export type EntityRole = (typeof roles.all)[number];

/** The roles the hierarchy declares for one channel, a subset of `EntityRole`. */
export type ChannelRoleOf<C extends ChannelEntityType> = (typeof hierarchy._roleMap)[C];

/** The organization's own roles, narrower than `EntityRole` in an app whose other channels declare more. */
export type OrganizationRole = ChannelRoleOf<'organization'>;

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

/** The channels below the organization a product row may be homed at: `HomeChannelType<'task'>` gives `'project'`. */
export type HomeChannelType<T extends ProductEntityType> = Exclude<AncestorChannelType<T>, 'organization'>;

/** Non-ancestor channels declared via `relatedChannels`. */
export type RelatedChannelType<E extends string> = E extends keyof HierarchyRelatedMap ? HierarchyRelatedMap[E] : never;

type HierarchyNullableMap = typeof hierarchy._nullableMap;

/** Variable-depth rows: `NullableAncestorType<'item'>` gives `'project' | 'courseSection'`. */
export type NullableAncestorType<E extends string> = E extends keyof HierarchyNullableMap ? HierarchyNullableMap[E] : never;

export type EntityActionType = (typeof appConfig.entityActions)[number];

/** A range read for sync: the rows stamped with a sequence position in (afterSeq, untilSeq]. */
export interface SeqRange {
  afterSeq: number;
  untilSeq: number;
}
