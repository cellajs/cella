import { useEffect } from 'react';
import { ySyncPluginKey, yUndoPluginKey } from 'y-prosemirror';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

/** Re-subscribes the UndoManager to Y.Doc transactions after each collaborative mount, since a TipTap remount reuses a destroyed manager. */
export function useYjsUndoManagerFix(editor: CustomBlockNoteEditor, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const resubscribeUndoManager = () => {
      const pmState = editor._tiptapEditor.state;
      if (!pmState) return;

      const doc = ySyncPluginKey.getState(pmState)?.doc;
      const undoManager = yUndoPluginKey.getState(pmState)?.undoManager;
      if (!doc || !undoManager?.afterTransactionHandler) return;

      // Drop any existing subscription first, so re-attaching stays idempotent.
      doc.off('afterTransaction', undoManager.afterTransactionHandler);
      doc.on('afterTransaction', undoManager.afterTransactionHandler);
    };

    resubscribeUndoManager();

    // Re-run on later mounts: an editability change unmounts and remounts the view.
    return editor.onMount(resubscribeUndoManager);
  }, [enabled, editor]);
}
