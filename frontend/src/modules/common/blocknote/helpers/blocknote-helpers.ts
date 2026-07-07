import { BlockNoteEditor } from '@blocknote/core';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { checkedExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';
import type { CustomBlock } from '~/modules/common/blocknote/types';

// Shared headless editor singleton — avoids expensive BlockNoteEditor.create() on every call
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

/**
 * Depth-first walk over parsed (JSON) blocks and their nested children.
 * Returning `false` from the visitor stops the traversal early — mirrors the
 * signature of `editor.forEachBlock`, which only works on a live editor's
 * document; this walker covers our JSON-string helpers.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: `boolean | void` lets visitors omit a return (mirrors editor.forEachBlock)
export const walkBlocks = (blocks: CustomBlock[], visitor: (block: CustomBlock) => boolean | void): boolean => {
  for (const block of blocks) {
    if (visitor(block) === false) return false;
    if (block.children?.length && !walkBlocks(block.children as CustomBlock[], visitor)) return false;
  }
  return true;
};

/**
 * Locate the media element for a click in rendered BlockNote content.
 * `includeWrapped` extends detection to media nested inside the click target and to
 * `.bn-file-block-content-wrapper` hits (file blocks without a media preview) — used
 * by the live editor; the static full-HTML renderer only matches direct media clicks.
 * Returns null when the click isn't on media.
 */
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

// biome-ignore lint/suspicious/noExplicitAny: schema-agnostic — custom block renderers pass narrower-schema editors
type AnyBlockNoteEditor = BlockNoteEditor<any, any, any>;

/**
 * Update a block without recording it in the undo/redo history.
 * Works in both collaborative (Yjs UndoManager) and non-collaborative (ProseMirror history) modes.
 * Uses BlockNote's `transact` so the outer transaction carries `addToHistory: false`.
 */
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
