import { BlockNoteEditor } from '@blocknote/core';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import type { CustomBlock } from '~/modules/common/blocknote/types';

// Shared headless editor singleton — avoids expensive BlockNoteEditor.create() on every call
let headlessEditor: ReturnType<typeof BlockNoteEditor.create> | null = null;
export const getHeadlessEditor = () => {
  if (!headlessEditor) {
    headlessEditor = BlockNoteEditor.create({ schema: customSchema, _headless: true });
  }
  return headlessEditor;
};

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

export const blocksToHTML = (srtBlocks: string) => {
  const blocks = JSON.parse(srtBlocks) as CustomBlock[];
  return getHeadlessEditor().blocksToHTMLLossy(blocks);
};

/**
 * Copies BlockNote content to clipboard with both HTML and Markdown formats.
 * HTML is used by rich text apps, Markdown ensures code blocks work in Copilot/plain text apps.
 */
export const copyBlocksToClipboard = async (strBlocks: string | null): Promise<boolean> => {
  if (!strBlocks) return false;

  try {
    const blocks = JSON.parse(strBlocks) as CustomBlock[];
    const editor = getHeadlessEditor();

    const markdown = editor.blocksToMarkdownLossy(blocks);
    const html = editor.blocksToHTMLLossy(blocks);

    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([markdown], { type: 'text/plain' }),
      }),
    ]);

    return true;
  } catch {
    return false;
  }
};

export const getRandomColor = () => {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
};
