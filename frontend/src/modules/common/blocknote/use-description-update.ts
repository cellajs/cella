import type { QueryKey } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { ProductEntityType } from 'shared';
import { patchDescriptionCaches } from '~/modules/common/blocknote/description-cache';
import { findInCache } from '~/query/basic/find-in-list-cache';

interface DescriptionUpdateOptions {
  entityType: ProductEntityType;
  entity: { id: string; description: string | null };
  keys: { detailKey: QueryKey; listKey: QueryKey };
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
  keys,
  update,
  derive,
  soloWriteDelayMs,
}: DescriptionUpdateOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);

  const writeSolo = async (description: string) => {
    if (description === entity.description) return;
    if (!findInCache(entityType, entity.id)) return;
    await update({ description });
  };

  const flushPending = async () => {
    const description = pendingRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    if (description !== null) await writeSolo(description);
  };

  // Closing the editor mid-debounce must not drop the last keystrokes.
  const flushRef = useRef(flushPending);
  flushRef.current = flushPending;
  useEffect(() => {
    return () => {
      if (timerRef.current) void flushRef.current();
    };
  }, []);

  return async (description: string, collaborative: boolean) => {
    if (collaborative) {
      patchDescriptionCaches(entityType, entity.id, keys, {
        description,
        ...derive?.(description),
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    if (!soloWriteDelayMs) {
      await writeSolo(description);
      return;
    }
    pendingRef.current = description;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushRef.current(), soloWriteDelayMs);
  };
}
