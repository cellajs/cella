import { useEffect } from 'react';
import type { WebsocketProvider } from 'y-websocket';
import { clearYjsUndoManagerStacks, getParsedContent } from '~/modules/common/blocknote/helpers/blocknote-helpers';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

interface UseYjsContentSeedArgs {
  editor: CustomBlockNoteEditor;
  provider: WebsocketProvider | undefined;
  defaultValue: string;
  /** Marks current content as baseline so the seed doesn't trigger a spurious PUT. */
  markContentAsSent: () => void;
}

/**
 * Seed Y.Doc with existing content on first sync when document is empty.
 *
 * Runs once on mount. If the editor is empty after the provider syncs, replaces
 * its blocks with the parsed `defaultValue` and clears the Yjs UndoManager
 * stacks so the seed isn't undoable. Always calls `markContentAsSent` so the
 * seed isn't sent back to the server as a user edit.
 *
 * Subsequent reconnects must NOT clear the user's undo history, so the sync
 * handler unsubscribes itself after the first run.
 */
export function useYjsContentSeed({ editor, provider, defaultValue, markContentAsSent }: UseYjsContentSeedArgs) {
  useEffect(() => {
    if (!provider || !defaultValue) return;

    let handled = false;

    const handleSync = (isSynced: boolean) => {
      if (!isSynced || handled) return;
      handled = true;
      // Unsubscribe immediately — reconnects must not clear the user's undo history
      provider.off('sync', handleSync);

      // If the editor is empty after sync, seed it with existing data
      if (editor.isEmpty) {
        const parsed = getParsedContent(defaultValue);
        if (parsed) {
          editor.replaceBlocks(editor.document, parsed);
          // Clear Yjs UndoManager stacks so the seed isn't undoable
          clearYjsUndoManagerStacks(editor);
        }
      }
      // Mark current content as baseline so the seed doesn't trigger a spurious PUT
      markContentAsSent();
    };

    if (provider.synced) {
      handleSync(true);
    } else {
      provider.on('sync', handleSync);
    }
    return () => provider.off('sync', handleSync);
  }, []); // Run once on mount
}
