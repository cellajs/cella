import type { KeyboardEventHandler } from 'react';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

// IDE-like wrapping characters (constant, no need to recreate per keystroke).
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

/**
 * Returns an `onKeyDown` with three IDE-like behaviors:
 * - Selection wrapping: typing `[ { ( \` " '` with a non-empty selection wraps it without replacing it.
 * - Escape / Cmd+Ctrl+Enter: commit (non-empty only) + onEscapeClick / onEnterClick. Enter stops
 *   propagation so the submit shortcut doesn't bubble to surrounding forms.
 */
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

    // Selection wrapping
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

    // Cmd/Ctrl + Enter
    event.stopPropagation();
    onEnterClick?.();
    if (!editor.isEmpty) commit();
  };
}
