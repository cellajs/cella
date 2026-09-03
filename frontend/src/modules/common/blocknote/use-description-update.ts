import type { ProductEntityType } from 'shared';
import { patchDescriptionCaches } from '~/modules/common/blocknote/description-cache';
import { getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { findInCache } from '~/query/basic/find-in-list-cache';

type DescribedEntity = { id: string; organizationId: string; description: string | null };

/**
 * Collaborative-session half of description persistence: the relay owns the write (materializing
 * through the same update op), so only the caches are patched until its row arrives over SSE.
 * `extra` carries fields views derive from the document (a title, a summary).
 */
export function patchCollaborativeDescription(
  entityType: ProductEntityType,
  entity: DescribedEntity,
  description: string,
  extra: Record<string, unknown> = {},
): void {
  const keys = getEntityQueryKeys(entityType);
  patchDescriptionCaches(
    entityType,
    entity.id,
    { detailKey: keys.detail.byId(entity.id), listKey: keys.list.org(entity.organizationId) },
    { description, ...extra, updatedAt: new Date().toISOString() },
  );
}

/**
 * Standalone half (no relay, offline, no permission token): the prepared update mutation, skipped
 * for an unchanged body and for a row deleted meanwhile, because an unmount flush would resurrect it.
 */
export async function persistStandaloneDescription(
  entityType: ProductEntityType,
  entity: DescribedEntity,
  description: string,
  update: (ops: { description: string }) => Promise<unknown>,
): Promise<void> {
  if (description === entity.description) return;
  if (!findInCache(entityType, entity.id)) return;
  await update({ description });
}

/** `updateData` for `CollaborativeBlockNote` composed from the two halves; editors with derived fields or debounce compose them directly. */
export function useDescriptionUpdate(
  entityType: ProductEntityType,
  entity: DescribedEntity,
  update: (ops: { description: string }) => Promise<unknown>,
) {
  return (description: string, collaborative: boolean) =>
    collaborative
      ? patchCollaborativeDescription(entityType, entity, description)
      : persistStandaloneDescription(entityType, entity, description, update);
}
