import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

/** Focuses the editor with the cursor at the end of block `blockId`, else of the last block; a block gone by then is ignored. */
export const focusEditor = (editor: CustomBlockNoteEditor, blockId?: string) => {
  try {
    editor.focus();
    editor.setTextCursorPosition(blockId ?? editor.document[editor.document.length - 1].id, 'end');
  } catch {}
};
