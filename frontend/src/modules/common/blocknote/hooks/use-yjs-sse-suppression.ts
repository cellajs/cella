import { useEffect } from 'react';
import type { ProductEntityType } from 'shared';
import { registerActiveYjsEditor, unregisterActiveYjsEditor } from '~/modules/common/blocknote/yjs-editor';

/**
 * Register the entity as actively Yjs-edited for the lifetime of the editor, so SSE
 * cache ops skip Yjs-owned fields (description + derived) — a slightly stale server
 * snapshot must not overwrite the fresher local Y.Doc state.
 *
 * Persistence is relay-side (the relay materializes the session into the entity row),
 * so there is nothing to flush on unmount: unregister immediately and let the next
 * SSE update bring authoritative values.
 *
 * Pass `null` when not in collaborative mode.
 */
export function useYjsSseSuppression(target: { entityType: ProductEntityType; entityId: string } | null) {
  const entityType = target?.entityType;
  const entityId = target?.entityId;

  useEffect(() => {
    if (!entityType || !entityId) return;
    registerActiveYjsEditor(entityType, entityId);
    return () => unregisterActiveYjsEditor(entityType, entityId);
  }, [entityType, entityId]);
}
