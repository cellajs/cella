import type { Block } from '@blocknote/core';

export const getContentAsString = (blocks: Block[]) => {
  const blocksStringifyContent = blocks
    .map((block) => {
      if (Array.isArray(block.content)) return (block.content[0] as { text: string } | undefined)?.text;
      return block.type;
    })
    .join('');
  return blocksStringifyContent;
};
