import { BlockNoteEditor } from '@blocknote/core';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import type { CustomBlock } from '~/modules/common/blocknote/types';

export const compareIsContentSame = (currentStringifiedBlocks: string, initialStringifiedBlocks: string) =>
  currentStringifiedBlocks === initialStringifiedBlocks;

export const getParsedContent = (initialStringifiedBlocks: string | undefined) => {
  if (!initialStringifiedBlocks) return undefined;
  try {
    return JSON.parse(initialStringifiedBlocks) as CustomBlock[];
  } catch {
    return undefined;
  }
};

export const blocksToHTML = async (srtBlocks: string) => {
  const editor = BlockNoteEditor.create({ schema: customSchema, _headless: true });
  const blocks = JSON.parse(srtBlocks) as CustomBlock[];

  return await editor.blocksToHTMLLossy(blocks);
};
