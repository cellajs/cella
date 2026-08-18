import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

export const focusEditor = (editor: CustomBlockNoteEditor, blockId?: string) => {
  const lastBlock = editor.document[editor.document.length - 1];
  try {
    editor.focus();
    editor.setTextCursorPosition(blockId ?? lastBlock.id, 'end');
  } catch (err) {}
};
