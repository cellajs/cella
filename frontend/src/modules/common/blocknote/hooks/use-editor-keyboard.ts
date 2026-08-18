import type { KeyboardEventHandler } from 'react';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

// Hoisted so the map is not rebuilt per keystroke.
const wrappingChars: Record<string, string> = {
  '[': ']',
  '{': '}',
  '(': ')',
  '`': '`',
  '"': '"',
  "'": "'",
};

interface UseEditorKeyboardArgs {
  editor: CustomBlockNoteEditor;
  /** Called on Escape and Cmd/Ctrl+Enter, after the data has been committed. */
  onEscapeClick?: () => void;
  onEnterClick?: () => void;
  /** Commits the editor's current document (parent decides what "commit" means). */
  commit: () => void;
}

/** Handle selection wrapping plus commit-and-close shortcuts without bubbling form submission. */
export function useEditorKeyboard({
  editor,
  onEscapeClick,
  onEnterClick,
  commit,
}: UseEditorKeyboardArgs): KeyboardEventHandler {
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

    if (isEscape) {
      if (!editor.isEmpty) commit();
      onEscapeClick?.();
      return;
    }

    event.stopPropagation();
    onEnterClick?.();
    if (!editor.isEmpty) commit();
  };
}
