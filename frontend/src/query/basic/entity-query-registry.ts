import type { EntityType } from 'shared';
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
 * Chunk size for delta sync fetches: the backend's max limit. A response of exactly this
 * size means the seq window may exceed one response; fetchRangeAndPatch treats that as
 * overflow and falls back to full list invalidation without paging.
 */
export const SYNC_CHUNK_SIZE = 1000;

/**
 * Delta fetch for catchup-based sync (organizationId null for public entities). Returns entities
 * changed in a seq range via the list endpoint's `seqCursor` param; implementations must request
 * `limit: String(SYNC_CHUNK_SIZE)` and forward `pathPrefix` when present.
 *
 * - seqCursor is always the bounded inclusive form "51,150" (seq >= 51 AND <= 150); every
 *   caller knows its upper bound (catchup from the view frontier, live from the batch end).
 * - pathPrefix optionally narrows the fetch to one channel subtree (server-side
 *   `path LIKE prefix/%` residual filter on top of the unchanged permission WHERE); the
 *   covering-fetch router passes the narrowest prefix that covers its dirty views.
 */
export type DeltaFetchFn = (
  organizationId: string | null,
  tenantId: string | null,
  seqCursor: string,
  pathPrefix?: string,
) => Promise<{ items: ItemData[]; total: number }>;

/**
 * Central registry decoupling entity modules from stream handlers: modules register keys at load
 * time (createEntityKeys -> registerEntityQueryKeys), stream/cache code looks them up by entityType.
 */
const entityQueryKeysRegistry = new Map<string, EntityQueryKeys>();
const deltaFetchRegistry = new Map<string, DeltaFetchFn>();

const SENTINEL_ORG = '__org__';
const SENTINEL_HOME = '__home__';
const SENTINEL_ID = '__id__';

/**
 * Probe the passed key builders with sentinel ids and assert the createEntityKeys shape that
 * live routing (cache-ops) and viewing detection (observed-channels) depend on: list keys are
 * `[entityType, 'list', ...ids]` with the org and home-channel ids as segments (or filter-object
 * values) past position 1, detail keys carry the entity id. Config-time and deterministic, so a
 * hand-rolled wrong shape fails at module load on the developer's machine; it never silently
 * degrades sync routing and viewing detection at runtime.
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
 * Register query keys for an entity type at module init. Optional `deltaFetch` lets the catchup
 * processor fetch only changed entities via `seqCursor`, avoiding a full list refetch.
 *
 * Canonical list data must live at `keys.list.home(orgId, homeChannelId)`: live sync splices
 * new rows only into a row's home list, and viewing detection (`observed-channels.ts`) derives
 * "this channel is on screen" from the channel id segment in observed list keys. Keys built
 * with `createEntityKeys` carry both by construction; hand-rolled keys are shape-checked here
 * at load time (throws), and cache-ops still warns at runtime when a fetched new row lands in
 * no cache (the second net: it also catches filters that exclude rows, which no shape probe
 * can see).
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

/**
 * Check if query keys are registered for an entity type.
 */
export function hasEntityQueryKeys(entityType: string): boolean {
  return entityQueryKeysRegistry.has(entityType);
}

/**
 * Get all registered entity types.
 */
export function getRegisteredEntityTypes(): string[] {
  return Array.from(entityQueryKeysRegistry.keys());
}

/**
 * Get the delta fetch function for an entity type, if registered.
 * Returns undefined if the entity type doesn't support delta fetching.
 */
export function getEntityDeltaFetch(entityType: string): DeltaFetchFn | undefined {
  return deltaFetchRegistry.get(entityType);
}
