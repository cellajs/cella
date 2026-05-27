import { useEffect } from 'react';
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
 *
 * TODO: revisit whether this workaround is still needed with current
 * @blocknote/react + y-prosemirror versions, or if the UndoManager can be
 * owned outside the plugin to avoid the introspection.
 */
export function useYjsUndoManagerFix(editor: CustomBlockNoteEditor, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const tiptap = editor._tiptapEditor;

    const resubscribeUndoManager = () => {
      try {
        const pmState = tiptap.state;
        if (!pmState) return;

        // Find the ySyncPlugin state (contains the Y.Doc) and the yUndoPlugin
        // state (contains the UndoManager) by walking ProseMirror plugins.
        let doc: { on: (e: string, h: unknown) => void; off: (e: string, h: unknown) => void } | undefined;
        let undoManager: { afterTransactionHandler: unknown } | undefined;

        for (const plugin of pmState.plugins) {
          const s = plugin.getState(pmState) as Record<string, unknown> | undefined;
          if (!s) continue;
          if (s.doc && typeof (s.doc as Record<string, unknown>).on === 'function') doc = s.doc as typeof doc;
          if (s.undoManager && typeof (s as Record<string, unknown>).undoManager === 'object') {
            undoManager = s.undoManager as typeof undoManager;
          }
        }

        if (doc && undoManager?.afterTransactionHandler) {
          doc.off('afterTransaction', undoManager.afterTransactionHandler);
          doc.on('afterTransaction', undoManager.afterTransactionHandler);
        }
      } catch {
        // Non-critical — if this fails, undo just won't work until next mount
      }
    };

    // Fix immediately (editor is already mounted by the time this effect runs)
    resubscribeUndoManager();

    // Also fix on future mounts (e.g. editability changes cause unmount→remount)
    tiptap.on('mount', resubscribeUndoManager);

    return () => {
      tiptap.off('mount', resubscribeUndoManager);
    };
  }, [enabled, editor]);
}
