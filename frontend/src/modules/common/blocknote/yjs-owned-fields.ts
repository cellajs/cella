import type { ProductEntityType } from 'shared';

/** Runtime registry of Yjs-owned fields: the description and the columns derived from it, which the cache takes only from a server write of them. */
const yjsOwnedFields = new Map<ProductEntityType, string[]>();

/** Call at module load, in the entity's query.ts. */
export function registerYjsOwnedFields(entityType: ProductEntityType, fields: string[]): void {
  yjsOwnedFields.set(entityType, fields);
}

/** The type's registered fields; `description` alone for an unregistered type. */
export function getYjsOwnedFields(entityType: ProductEntityType): string[] {
  return yjsOwnedFields.get(entityType) ?? ['description'];
}
