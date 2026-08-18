import { BlockNoteEditor } from '@blocknote/core';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { checkedExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';
import type { CustomBlock } from '~/modules/common/blocknote/types';

// Shared headless editor singleton avoids expensive BlockNoteEditor.create() on every call.
let headlessEditor: ReturnType<typeof BlockNoteEditor.create> | null = null;
export const getHeadlessEditor = () => {
  if (!headlessEditor) {
    headlessEditor = BlockNoteEditor.create({
      schema: customSchema,
      _headless: true,
      extensions: [checkedExtension()],
    });
  }
  return headlessEditor;
};

/** Depth-first walk over parsed blocks and children; returning `false` from the visitor stops early. */
// biome-ignore lint/suspicious/noConfusingVoidType: `boolean | void` lets visitors omit a return (mirrors editor.forEachBlock)
export const walkBlocks = (blocks: CustomBlock[], visitor: (block: CustomBlock) => boolean | void): boolean => {
  for (const block of blocks) {
    if (visitor(block) === false) return false;
    if (block.children?.length && !walkBlocks(block.children as CustomBlock[], visitor)) return false;
  }
  return true;
};

/** Media element for a click in rendered content, or null. `includeWrapped` also matches nested media and file blocks without a preview. */
export const findClickedMedia = (
  target: HTMLElement,
  { includeWrapped = false } = {},
): { src: string | undefined } | null => {
  const mediaElement =
    target.closest<HTMLElement>('img, video, audio') ??
    (includeWrapped ? target.querySelector<HTMLElement>('img, video, audio') : null);
  const insideFileBlock = includeWrapped && !!target.closest('.bn-file-block-content-wrapper');

  if (!mediaElement && !insideFileBlock) return null;
  return { src: (mediaElement as HTMLMediaElement | null)?.src };
};

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

/** Writes both HTML (for rich text targets) and Markdown (so code blocks survive in plain-text targets). */
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

// biome-ignore lint/suspicious/noExplicitAny: schema-agnostic; custom block renderers pass narrower-schema editors
type AnyBlockNoteEditor = BlockNoteEditor<any, any, any>;

/** The outer `transact` carries `addToHistory: false`, which covers both the Yjs UndoManager and ProseMirror history. */
export const updateBlockWithoutHistory = <TEditor extends AnyBlockNoteEditor>(
  editor: TEditor,
  blockId: Parameters<TEditor['updateBlock']>[0],
  update: Parameters<TEditor['updateBlock']>[1],
) => {
  editor.transact((tr: { setMeta: (key: string, value: boolean) => void }) => {
    tr.setMeta('addToHistory', false);
    editor.updateBlock(blockId, update);
  });
};
