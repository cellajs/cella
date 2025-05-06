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
