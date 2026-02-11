import { appConfig, type ContextEntityType, type EntityIdColumnKey } from 'shared';
import { membershipsTable } from '#/db/schema/memberships';
import type { MembershipBaseModel } from './select';

/** Context entity type -> membership context id column key (from config) */
type ContextIdKeyMap = {
  [K in ContextEntityType]: EntityIdColumnKey<K>;
};

/** Context entity type -> Drizzle column on membershipsTable */
type ContextColumnMap = {
  [K in ContextEntityType]: (typeof membershipsTable)[ContextIdKeyMap[K]];
};

/** Context entity type -> context id value type on a membership model */
type MembershipContextId<T extends ContextEntityType, M> = M extends Record<ContextIdKeyMap[T], infer V> ? V : never;

/** Resolve the Drizzle column for a given context entity type. */
export const getMembershipContextColumn = <T extends ContextEntityType>(contextType: T): ContextColumnMap[T] => {
  const key = appConfig.entityIdColumnKeys[contextType] as ContextIdKeyMap[T];
  return membershipsTable[key] as ContextColumnMap[T];
};

/** Get the configured context ID property name for a membership. */
export const getMembershipContextIdKey = <T extends ContextEntityType>(contextType: T): ContextIdKeyMap[T] => {
  return appConfig.entityIdColumnKeys[contextType] as ContextIdKeyMap[T];
};

/**
 * Read the context ID value from a membership using the strongly typed key.
 * (Generic over the membership you pass in so the return type narrows.)
 */
export const getMembershipContextId = <
  T extends ContextEntityType,
  M extends Record<ContextIdKeyMap[T], unknown> = MembershipBaseModel,
>(
  membership: M,
  contextType: T,
): MembershipContextId<T, M> => {
  const key = getMembershipContextIdKey(contextType);
  return membership[key] as MembershipContextId<T, M>;
};
