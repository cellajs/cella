import { type EntityType, hierarchy, type ProductEntityType } from 'shared';
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

/**
 * Chunk size for delta fetches (the backend's max limit). A response of exactly this size means
 * the seq window may exceed one response; fetchRangeAndPatch treats that as overflow and falls
 * back to full list invalidation without paging.
 */
export const SYNC_CHUNK_SIZE = 1000;

/**
 * Fetches one bounded inclusive sequence range for catchup, optionally narrowed to a subtree.
 * Public entities omit organization, and implementations use `SYNC_CHUNK_SIZE` as their limit.
 */
export type DeltaFetchFn = (
  organizationId: string | null,
  tenantId: string | null,
  seqCursor: string,
  pathPrefix?: string,
) => Promise<{ items: ItemData[]; total: number }>;

/** Registry decoupling entity modules from stream handlers: modules register keys at load time, stream/cache code looks them up by entityType. */
const entityQueryKeysRegistry = new Map<string, EntityQueryKeys>();
const deltaFetchRegistry = new Map<string, DeltaFetchFn>();

const SENTINEL_ORG = '__org__';
const SENTINEL_HOME = '__home__';
const SENTINEL_ID = '__id__';

/**
 * Validate entity-key builders against the list and detail shapes required by live routing.
 * Deterministic startup failure prevents malformed custom keys from silently degrading sync.
 */
function assertKeyContract(entityType: EntityType, keys: EntityQueryKeys): void {
  const carries = (key: readonly unknown[], id: string) =>
    key.some(
      (segment) =>
        segment === id || (segment != null && typeof segment === 'object' && Object.values(segment).includes(id)),
    );
  const fail = (builder: string, requirement: string): never => {
    throw new Error(
      `registerEntityQueryKeys(${entityType}): ${builder} must ${requirement} ` +
        '(createEntityKeys contract - see cella/SYNC_ENGINE.md)',
    );
  };

  const home = keys.list.home(SENTINEL_ORG, SENTINEL_HOME);
  if (home[0] !== entityType || home[1] !== 'list') fail('list.home(...)', `start with [${entityType}, 'list']`);
  if (!carries(home, SENTINEL_ORG) || !carries(home, SENTINEL_HOME))
    fail('list.home(...)', 'carry the org and home-channel ids');

  const org = keys.list.org(SENTINEL_ORG);
  if (org[0] !== entityType || org[1] !== 'list') fail('list.org(...)', `start with [${entityType}, 'list']`);
  if (!carries(org, SENTINEL_ORG)) fail('list.org(...)', 'carry the org id');

  const detail = keys.detail.byId(SENTINEL_ID);
  if (detail[0] !== entityType) fail('detail.byId(...)', `start with [${entityType}]`);
  if (!carries(detail, SENTINEL_ID)) fail('detail.byId(...)', 'carry the entity id');
}

/**
 * Registers validated entity query keys and an optional sequence delta fetcher at module load.
 * Canonical list data must use home keys because live sync placement and channel observation derive
 * from that shape; hand-written keys fail validation.
 */
export function registerEntityQueryKeys(
  entityType: EntityType,
  keys: EntityQueryKeys,
  deltaFetch?: DeltaFetchFn,
): void {
  assertKeyContract(entityType, keys);
  entityQueryKeysRegistry.set(entityType, keys);
  if (deltaFetch) deltaFetchRegistry.set(entityType, deltaFetch);
}

/** Throws if the entity type was not registered. All types must register before stream/cache code runs. */
export function getEntityQueryKeys(entityType: string): EntityQueryKeys {
  const keys = entityQueryKeysRegistry.get(entityType);
  if (!keys) throw new Error(`No query keys registered for entity type: ${entityType}`);
  return keys;
}

/** Whether query keys are registered for an entity type. */
export function hasEntityQueryKeys(entityType: string): boolean {
  return entityQueryKeysRegistry.has(entityType);
}

/** All registered entity types. */
export function getRegisteredEntityTypes(): string[] {
  return Array.from(entityQueryKeysRegistry.keys());
}

/** Registered entity types that are product entities: client-wired and product-classified. */
export function getRegisteredProductEntityTypes(): ProductEntityType[] {
  return getRegisteredEntityTypes().filter((t) => hierarchy.isProduct(t));
}

/** The entity type's delta fetch function, or undefined if it does not support delta fetching. */
export function getEntityDeltaFetch(entityType: string): DeltaFetchFn | undefined {
  return deltaFetchRegistry.get(entityType);
}
