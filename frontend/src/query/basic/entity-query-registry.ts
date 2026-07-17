import { appConfig, type EntityType, hierarchy } from 'shared';
import type { ItemData } from '~/query/basic/types';

/** Minimal query keys interface needed by stream handlers. */
export interface EntityQueryKeys {
  list: {
    base: readonly unknown[];
    org: (organizationId: string) => readonly unknown[];
    /** Canonical scope key: args are hierarchy ancestor IDs (root-first) */
    scope: (...ancestorIds: string[]) => readonly unknown[];
    /** Ancestor ID column keys in root-first order, e.g. ['organizationId', 'projectId'] for task */
    scopeKeys: readonly string[];
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
 * changed since a seq via the list endpoint's `seqCursor` param; implementations must request
 * `limit: String(SYNC_CHUNK_SIZE)`.
 *
 * seqCursor formats:
 * - "51":     open-ended (seq >= 51), used by catchup
 * - "51,150": bounded (seq >= 51 AND <= 150), used by batch notifications
 */
export type DeltaFetchFn = (
  organizationId: string | null,
  tenantId: string | null,
  seqCursor: string,
) => Promise<{ items: ItemData[]; total: number }>;

/**
 * Central registry decoupling entity modules from stream handlers: modules register keys at load
 * time (createEntityKeys -> registerEntityQueryKeys), stream/cache code looks them up by entityType.
 */
const entityQueryKeysRegistry = new Map<string, EntityQueryKeys>();
const deltaFetchRegistry = new Map<string, DeltaFetchFn>();

/**
 * Register query keys for an entity type at module init. Optional `deltaFetch` lets the catchup
 * processor fetch only changed entities via `seqCursor`, avoiding a full list refetch.
 *
 * Sub-org-homed entities must expose their home channel's id column in `list.scopeKeys`. Viewing
 * detection (`observed-channels.ts`) derives "this channel is on screen" from observed list keys,
 * and keys that cannot carry the channel id would silently demote every on-screen scope to the
 * background sync tier. Keys built with `createEntityKeys` always satisfy this; the throw exists
 * for hand-rolled keys, at module load so it cannot reach production.
 */
export function registerEntityQueryKeys(
  entityType: EntityType,
  keys: EntityQueryKeys,
  deltaFetch?: DeltaFetchFn,
): void {
  const ancestors = hierarchy.getOrderedAncestors(entityType);
  const homeChannel = ancestors[0];
  if (homeChannel && homeChannel !== ancestors[ancestors.length - 1]) {
    const column = (appConfig.entityIdColumnKeys as Record<string, string>)[homeChannel];
    if (column && !keys.list.scopeKeys.includes(column)) {
      throw new Error(
        `Query keys for '${entityType}' lack home channel column '${column}' in list.scopeKeys — ` +
          `viewing detection cannot see '${homeChannel}' scopes. Use createEntityKeys or add the column.`,
      );
    }
  }

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
