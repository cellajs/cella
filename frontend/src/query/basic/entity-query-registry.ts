import type { EntityType } from 'shared';
import type { ItemData } from '~/query/basic/types';

/** Minimal query keys interface needed by stream handlers. */
export interface EntityQueryKeys {
  list: { base: readonly unknown[] };
  detail: { base: readonly unknown[]; byId: (id: string) => readonly unknown[] };
}

/**
 * Delta fetch function signature for catchup-based sync.
 * Called with orgId (null for public entities) and the client's last known seq.
 * Returns changed entities since that seq via the list endpoint's `afterSeq` param.
 */
export type DeltaFetchFn = (orgId: string | null, afterSeq: number) => Promise<{ items: ItemData[]; total: number }>;

/**
 * Central registry for entity query keys.
 * Modules register their query keys here, enabling dynamic lookup in stream handlers.
 *
 * Usage in entity modules:
 * ```ts
 * // At module load time (e.g., in query.ts)
 * const keys = createEntityKeys<Filters>('attachment');
 * registerEntityQueryKeys('attachment', keys);
 * export const attachmentQueryKeys = keys;
 * ```
 *
 * Usage in stream handlers:
 * ```ts
 * const keys = getEntityQueryKeys(entityType);
 * queryClient.invalidateQueries({ queryKey: keys.list.base });
 * ```
 */
const entityQueryKeysRegistry = new Map<string, EntityQueryKeys>();
const deltaFetchRegistry = new Map<string, DeltaFetchFn>();

/**
 * Register query keys for an entity type, with optional delta fetch support.
 * Call this at module initialization (e.g., in the entity's query.ts file).
 *
 * The `deltaFetch` function enables efficient catchup: instead of full list refetch,
 * the catchup processor calls the list endpoint with `afterSeq` to get only changed entities.
 */
export function registerEntityQueryKeys(
  entityType: EntityType,
  keys: EntityQueryKeys,
  deltaFetch?: DeltaFetchFn,
): void {
  entityQueryKeysRegistry.set(entityType, keys);
  if (deltaFetch) deltaFetchRegistry.set(entityType, deltaFetch);
}

/**
 * Get query keys for an entity type.
 * Throws if the entity type hasn't been registered — all entity types
 * must be registered at module load time before any stream/cache code runs.
 */
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
