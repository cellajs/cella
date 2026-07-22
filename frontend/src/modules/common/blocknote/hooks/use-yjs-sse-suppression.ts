import { useEffect } from 'react';
import type { ProductEntityType } from 'shared';
import { registerActiveYjsEditor, unregisterActiveYjsEditor } from '~/modules/common/blocknote/yjs-editor';

/**
 * Suppresses SSE writes to Yjs-owned fields while a collaborative editor is active.
 * The relay persists state, so unmount unregisters immediately without another flush.
 * Pass null outside collaborative mode.
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
