import type { ProductEntityType } from 'shared';
import { deriveDescriptionFields } from '~/modules/common/blocknote/description-derivation';
import { cacheUpdate } from '~/query/basic/cache-mutations';
import { getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { findInCache } from '~/query/basic/find-in-list-cache';
import type { ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';

type DescribedEntity = { id: string; organizationId: string; description: string | null };

/** The prepared update mutation, called with the new description. */
type DescriptionMutation = (ops: { description: string }) => Promise<unknown>;

/**
 * Collaborative half of description persistence: the relay writes the row through the same update operation, and card
 * and list views render from the query cache, not the Y.Doc, so the detail and the list row are patched until the
 * relay's row arrives over SSE. The patch carries the type's registered derivation; `extra` fields override it.
 */
export function patchCollaborativeDescription(
  entityType: ProductEntityType,
  entity: DescribedEntity,
  description: string,
  extra: Record<string, unknown> = {},
): void {
  const keys = getEntityQueryKeys(entityType);
  const patch = { description, ...deriveDescriptionFields(entityType, description), ...extra, updatedAt: new Date().toISOString() };
  queryClient.setQueryData<ItemData>(keys.detail.byId(entity.id), (old) => (old ? { ...old, ...patch } : undefined));
  const cached = findInCache<ItemData>(entityType, entity.id);
  if (cached) cacheUpdate(keys.list.org(entity.organizationId), [{ ...cached, ...patch }]);
}

/**
 * Standalone half, for an app with Yjs off: the prepared update mutation, skipped for an unchanged body and for a row
 * deleted meanwhile, because an unmount flush would resurrect it. With Yjs on, an editor never writes one through REST.
 * @public
 */
export async function persistStandaloneDescription(
  entityType: ProductEntityType,
  entity: DescribedEntity,
  description: string,
  update: DescriptionMutation,
): Promise<void> {
  if (description === entity.description) return;
  if (!findInCache(entityType, entity.id)) return;
  await update({ description });
}

/** `updateData` for `CollaborativeBlockNote` composed from the two halves; editors with derived fields or debounce compose them directly. */
export function createDescriptionUpdater(entityType: ProductEntityType, entity: DescribedEntity, update: DescriptionMutation) {
  return (description: string, collaborative: boolean) =>
    collaborative
      ? patchCollaborativeDescription(entityType, entity, description)
      : persistStandaloneDescription(entityType, entity, description, update);
}
