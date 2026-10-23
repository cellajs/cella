import type { KeyboardEventHandler } from 'react';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

const wrappingChars: Record<string, string> = { '[': ']', '{': '}', '(': ')', '`': '`', '"': '"', "'": "'" };

interface UseEditorKeyboardOptions {
  editor: CustomBlockNoteEditor;
  onEscape?: () => void;
  onCmdEnter?: () => void;
  /** Commits the current document; the caller decides what that writes, and whether an empty document counts. */
  commit: () => void;
}

/** Wraps a selection in brackets or quotes; Escape and Cmd/Ctrl+Enter commit, then call their callback; Cmd+Enter does not bubble to a form. */
export function useEditorKeyboard({ editor, onEscape, onCmdEnter, commit }: UseEditorKeyboardOptions): KeyboardEventHandler {
  return (event) => {
    const { metaKey, ctrlKey, key } = event;
    const isEscape = key === 'Escape';
    const isCmdEnter = key === 'Enter' && (metaKey || ctrlKey);

    if (key in wrappingChars) {
      const pmState = editor.prosemirrorState;
      const { from, to } = pmState.selection;

      if (from !== to) {
        event.preventDefault();

        const closing = wrappingChars[key];
        const tr = pmState.tr;
        // Insert closing char first (at `to`) so `from` offset stays valid.
        tr.insertText(closing, to);
        tr.insertText(key, from);
        editor.prosemirrorView.dispatch(tr);
        return;
      }
    }

    if (!isEscape && !isCmdEnter) return;

    event.preventDefault();
    if (isCmdEnter) event.stopPropagation();

    commit();
    if (isEscape) onEscape?.();
    else onCmdEnter?.();
  };
}
