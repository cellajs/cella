import type { Block } from '@blocknote/core';

export const triggerFocus = (id: string) => {
  const editorContainerElement = document.getElementById(id);
  const editorElement = editorContainerElement?.getElementsByClassName('bn-editor')[0] as HTMLDivElement | undefined;
  editorElement?.focus();
};

export const getContentAsString = (blocks: Block[]) => {
  const blocksStringifyContent = blocks
    .map((block) => {
      if (Array.isArray(block.content)) return (block.content[0] as { text: string } | undefined)?.text;
      return block.type;
    })
    .join('');
  return blocksStringifyContent;
};
