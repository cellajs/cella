import type { EntityType } from 'shared';

/** Minimal query keys interface needed by stream handlers. */
export interface EntityQueryKeys {
  list: { base: readonly unknown[] };
  detail: { byId: (id: string) => readonly unknown[] };
}

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
 * if (keys) queryClient.invalidateQueries({ queryKey: keys.list.base });
 * ```
 */
const entityQueryKeysRegistry = new Map<string, EntityQueryKeys>();

/**
 * Register query keys for an entity type.
 * Call this at module initialization (e.g., in the entity's query.ts file).
 */
export function registerEntityQueryKeys(entityType: EntityType, keys: EntityQueryKeys): void {
  entityQueryKeysRegistry.set(entityType, keys);
}

/**
 * Get query keys for an entity type.
 * Returns undefined if the entity type hasn't been registered.
 */
export function getEntityQueryKeys(entityType: string): EntityQueryKeys | undefined {
  return entityQueryKeysRegistry.get(entityType);
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
