import type { ProductEntityType } from 'shared';

/** Runtime registry of fields owned by Yjs during collaborative editing — SSE updates skip these */
const yjsOwnedFields = new Map<ProductEntityType, string[]>();

/** Register Yjs-owned fields for an entity type. Call at module load time (e.g., in the entity's query.ts). */
export function registerYjsOwnedFields(entityType: ProductEntityType, fields: string[]): void {
  yjsOwnedFields.set(entityType, fields);
}

/** Fields owned by Yjs for an entity type while a collaborative editor is active. */
export function getYjsOwnedFields(entityType: ProductEntityType): string[] {
  return yjsOwnedFields.get(entityType) ?? ['description'];
}

/**
 * Registry of entities with active Yjs editors, used by SSE cache ops to suppress
 * description-derived field updates while the local editor has a more recent
 * Y.Doc state. Plain module state — consumers only do imperative lookups,
 * nothing subscribes reactively.
 */
const activeYjsEditors = new Map<ProductEntityType, Set<string>>();

export function registerActiveYjsEditor(entityType: ProductEntityType, entityId: string): void {
  const ids = activeYjsEditors.get(entityType) ?? new Set();
  ids.add(entityId);
  activeYjsEditors.set(entityType, ids);
}

export function unregisterActiveYjsEditor(entityType: ProductEntityType, entityId: string): void {
  const ids = activeYjsEditors.get(entityType);
  if (!ids) return;
  ids.delete(entityId);
  if (ids.size === 0) activeYjsEditors.delete(entityType);
}

export function isYjsEditorActive(entityType: ProductEntityType, entityId: string): boolean {
  return activeYjsEditors.get(entityType)?.has(entityId) ?? false;
}
