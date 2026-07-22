import { useEffect } from 'react';
import { ySyncPluginKey, yUndoPluginKey } from 'y-prosemirror';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

/**
 * Restores Yjs undo tracking after TipTap view remounts reuse a destroyed UndoManager.
 * It re-subscribes the manager to Y.Doc transactions after each collaborative mount and
 * does nothing for non-collaborative editors.
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
