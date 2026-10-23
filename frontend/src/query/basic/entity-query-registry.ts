import { type EntityType, isProduct, type ProductEntityType } from 'shared';
import type { ItemData } from '~/query/basic/types';

/** Minimal query keys interface needed by stream handlers. */
export interface EntityQueryKeys {
  list: {
    base: readonly unknown[];
    org: (organizationId: string) => readonly unknown[];
    /** Canonical home list key: one flat list per home channel (org-homed rows: omit homeChannelId) */
    home: (organizationId: string, homeChannelId?: string) => readonly unknown[];
  };
  detail: { base: readonly unknown[]; byId: (id: string) => readonly unknown[] };
}

/** The backend's max limit for range fetches: a response of exactly this size may truncate the range, and fetchRangeAndPatch treats that as overflow. */
export const syncChunkSize = 1000;

/** A range read for sync: the rows stamped with a sequence position in (afterSeq, untilSeq]. */
export interface SeqRange {
  afterSeq: number;
  untilSeq: number;
}

/**
 * Fetches one sequence range for catchup, optionally narrowed to a subtree. Public entities omit organization. `query`
 * holds the range and the chunk limit, ready to spread into the product's list request.
 */
export type RangeFetch = (request: {
  organizationId: string | null;
  tenantId: string | null;
  channelId?: string;
  query: SeqRange & { limit: number };
}) => Promise<{ items: ItemData[]; total: number }>;

/** Registry decoupling entity modules from stream handlers: modules register keys at load time, stream/cache code looks them up by entityType. */
const entityQueryKeysRegistry = new Map<string, EntityQueryKeys>();
const rangeFetchRegistry = new Map<string, RangeFetch>();
const equalityFilterKeysRegistry = new Map<string, readonly string[]>();

const sentinelOrg = '__org__';
const sentinelHome = '__home__';
const sentinelId = '__id__';

/** Validates key builders against the list and detail shapes live routing requires, so a malformed custom key fails at startup and not during sync. */
function assertKeyContract(entityType: EntityType, keys: EntityQueryKeys): void {
  const carries = (key: readonly unknown[], id: string) =>
    key.some((segment) => segment === id || (segment != null && typeof segment === 'object' && Object.values(segment).includes(id)));
  const fail = (builder: string, requirement: string): never => {
    throw new Error(`registerEntityQueryKeys(${entityType}): ${builder} must ${requirement} (createEntityKeys contract - see cella/SYNC_ENGINE.md)`);
  };

  const home = keys.list.home(sentinelOrg, sentinelHome);
  if (home[0] !== entityType || home[1] !== 'list') fail('list.home(...)', `start with [${entityType}, 'list']`);
  if (!carries(home, sentinelOrg) || !carries(home, sentinelHome)) fail('list.home(...)', 'carry the org and home-channel ids');

  const org = keys.list.org(sentinelOrg);
  if (org[0] !== entityType || org[1] !== 'list') fail('list.org(...)', `start with [${entityType}, 'list']`);
  if (!carries(org, sentinelOrg)) fail('list.org(...)', 'carry the org id');

  const detail = keys.detail.byId(sentinelId);
  if (detail[0] !== entityType) fail('detail.byId(...)', `start with [${entityType}]`);
  if (!carries(detail, sentinelId)) fail('detail.byId(...)', 'carry the entity id');
}

/** Canonical list data must use home keys, because live sync placement and channel observation derive from that shape; hand-written keys fail validation. */
export function registerEntityQueryKeys(entityType: EntityType, keys: EntityQueryKeys, rangeFetch?: RangeFetch): void {
  assertKeyContract(entityType, keys);
  entityQueryKeysRegistry.set(entityType, keys);
  if (rangeFetch) rangeFetchRegistry.set(entityType, rangeFetch);
}

/** Throws if the entity type was not registered. All types must register before stream/cache code runs. */
export function getEntityQueryKeys(entityType: string): EntityQueryKeys {
  const keys = entityQueryKeysRegistry.get(entityType);
  if (!keys) throw new Error(`No query keys registered for entity type: ${entityType}`);
  return keys;
}

export function hasEntityQueryKeys(entityType: string): boolean {
  return entityQueryKeysRegistry.has(entityType);
}

export function getRegisteredEntityTypes(): string[] {
  return Array.from(entityQueryKeysRegistry.keys());
}

/** Registered entity types that are product entities: client-wired and product-classified. */
export function getRegisteredProductEntityTypes(): ProductEntityType[] {
  return getRegisteredEntityTypes().filter(isProduct);
}

/** Undefined when the entity type does not support range fetching. */
export function getEntityRangeFetch(entityType: string): RangeFetch | undefined {
  return rangeFetchRegistry.get(entityType);
}

/**
 * Declares list filter keys that a row matches only when its field of the same name equals the filter value, as `itemId` on
 * a `{ itemId }` list. A new row then skips a filtered list that sets one of these keys to another value; a list that sets
 * none of them keeps the refetch.
 */
export function registerEqualityFilterKeys(entityType: EntityType, filterKeys: readonly string[]): void {
  equalityFilterKeysRegistry.set(entityType, filterKeys);
}

/** Undefined when the entity type declared no equality filter keys: every filtered list refetches on a new row. */
export function getEqualityFilterKeys(entityType: string): readonly string[] | undefined {
  return equalityFilterKeysRegistry.get(entityType);
}
