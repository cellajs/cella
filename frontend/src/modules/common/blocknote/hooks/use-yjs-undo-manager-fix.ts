import { useEffect } from 'react';
import { ySyncPluginKey, yUndoPluginKey } from 'y-prosemirror';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

/**
 * Fix Yjs UndoManager after TipTap mount/unmount cycles.
 *
 * React StrictMode (dev) and editability changes trigger unmount→remount of the
 * EditorView. The yUndoPlugin's `view.destroy()` calls `undoManager.destroy()`,
 * which unsubscribes it from Y.Doc's `afterTransaction` event. On remount, the
 * destroyed UndoManager is reused from the plugin state and can't capture new
 * changes. This hook re-subscribes the UndoManager after each mount so CMD+Z
 * keeps working.
 *
 * No-op when `enabled` is false (non-collaborative editors don't use yUndoPlugin).
 */
export function useYjsUndoManagerFix(editor: CustomBlockNoteEditor, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const resubscribeUndoManager = () => {
      const pmState = editor._tiptapEditor.state;
      if (!pmState) return;

      // Read the Y.Doc from the ySyncPlugin state and the UndoManager from the
      // yUndoPlugin state via their public plugin keys (identity-shared with the
      // y-prosemirror instance BlockNote uses).
      const doc = ySyncPluginKey.getState(pmState)?.doc;
      const undoManager = yUndoPluginKey.getState(pmState)?.undoManager;
      if (!doc || !undoManager?.afterTransactionHandler) return;

      // Idempotent re-attach: drop any existing subscription, then re-add so a
      // destroyed-then-reused UndoManager captures changes again.
      doc.off('afterTransaction', undoManager.afterTransactionHandler);
      doc.on('afterTransaction', undoManager.afterTransactionHandler);
    };

    // Fix immediately (editor is already mounted by the time this effect runs)
    resubscribeUndoManager();

    // Also fix on future mounts (e.g. editability changes cause unmount→remount)
    return editor.onMount(resubscribeUndoManager);
  }, [enabled, editor]);
}
