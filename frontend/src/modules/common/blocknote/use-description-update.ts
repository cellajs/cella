import { useEffect } from 'react';
import type { ProductEntityType } from 'shared';
import { useDebouncedCallback } from 'use-debounce';
import { patchDescriptionCaches } from '~/modules/common/blocknote/description-cache';
import { getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { findInCache } from '~/query/basic/find-in-list-cache';

interface DescriptionUpdateOptions {
  entityType: ProductEntityType;
  entity: { id: string; organizationId: string; description: string | null };
  /** The product's update mutation; runs only in standalone mode. */
  update: (ops: { description: string }) => Promise<unknown>;
  /** Fields derived from the document that list and detail views render (a title, a summary), patched alongside it. */
  derive?: (description: string) => Record<string, unknown>;
  /** Debounce for standalone writes when the editor commits on every change; omit for commit-on-blur editors. */
  soloWriteDelayMs?: number;
}

/**
 * Description persistence policy for `CollaborativeBlockNote`. In a collaborative session the
 * relay owns the write (materializing through the same update op), so only the caches are
 * patched until its row arrives over SSE. Standalone mode (no relay, offline, no permission
 * token) uses the prepared update mutation, skipped when the row was deleted meanwhile because
 * an unmount flush would resurrect it.
 */
export function useDescriptionUpdate({
  entityType,
  entity,
  update,
  derive,
  soloWriteDelayMs = 0,
}: DescriptionUpdateOptions) {
  const writeSolo = async (description: string) => {
    if (description === entity.description) return;
    if (!findInCache(entityType, entity.id)) return;
    await update({ description });
  };
  const writeSoloDebounced = useDebouncedCallback(writeSolo, soloWriteDelayMs);

  // Closing the editor mid-debounce must not drop the last keystrokes.
  useEffect(() => () => void writeSoloDebounced.flush(), [writeSoloDebounced]);

  return async (description: string, collaborative: boolean) => {
    if (collaborative) {
      const keys = getEntityQueryKeys(entityType);
      patchDescriptionCaches(
        entityType,
        entity.id,
        { detailKey: keys.detail.byId(entity.id), listKey: keys.list.org(entity.organizationId) },
        { description, ...derive?.(description), updatedAt: new Date().toISOString() },
      );
      return;
    }
    if (soloWriteDelayMs) writeSoloDebounced(description);
    else await writeSolo(description);
  };
}
