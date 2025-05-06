import type { KeyboardEventHandler } from 'react';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

export const createHandleKeyDown = ({
  editor,
  handleDataUpdate,
  onEnterClick,
  onEscapeClick,
}: {
  editor: CustomBlockNoteEditor;
  handleDataUpdate: (description: string) => void;
  onEnterClick?: () => void;
  onEscapeClick?: () => void;
}): KeyboardEventHandler => {
  return async (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onEscapeClick?.();
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();

      const hasContent = editor.document?.some((block) => {
        const content = block.content;
        return Array.isArray(content) && (content as { text: string }[])[0]?.text.trim() !== '';
      });

      if (hasContent) {
        const blocksToUpdate = handleSubmitOnEnter(editor);
        if (blocksToUpdate) {
          const description = JSON.stringify(editor.document);
          handleDataUpdate(description);
        }
        onEnterClick?.();
      }
    }
  };
};

const handleSubmitOnEnter = (editor: CustomBlockNoteEditor): CustomBlockNoteEditor['document'] | null => {
  const blocks = editor.document;
  // Get the last block and modify its content so we remove last \n
  const lastBlock = blocks[blocks.length - 1];
  if (Array.isArray(lastBlock.content)) {
    const lastBlockContent = lastBlock.content as { text: string }[];
    if (lastBlockContent.length > 0) lastBlockContent[0].text = lastBlockContent[0].text.replace(/\n$/, ''); // Remove the last newline character
    const updatedLastBlock = { ...lastBlock, content: lastBlockContent };
    return [...blocks.slice(0, -1), updatedLastBlock] as CustomBlockNoteEditor['document'];
  }
  return null;
};
