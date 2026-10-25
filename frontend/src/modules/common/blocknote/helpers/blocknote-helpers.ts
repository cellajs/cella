import { BlockNoteEditor } from '@blocknote/core';
import { parseBlocks } from 'shared/blocknote';
import { customSchema } from '~/modules/common/blocknote/blocknote-schema';
import { checkedExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';
import type { AnyBlockNoteEditor, CustomBlock } from '~/modules/common/blocknote/types';

// Shared headless editor singleton avoids expensive BlockNoteEditor.create() on every call.
let headlessEditor: ReturnType<typeof BlockNoteEditor.create> | null = null;
export const getHeadlessEditor = () => {
  if (!headlessEditor) {
    headlessEditor = BlockNoteEditor.create({ schema: customSchema, _headless: true, extensions: [checkedExtension()] });
  }
  return headlessEditor;
};

/** Block id of the media a click in rendered content hit, or null. `includeWrapped` also matches nested media and file blocks without a preview. */
export const findClickedMediaBlockId = (target: EventTarget, { includeWrapped = false } = {}): string | null => {
  if (!(target instanceof Element)) return null;
  const media =
    target.closest('img, video, audio') ??
    (includeWrapped ? (target.querySelector('img, video, audio') ?? target.closest('.bn-file-block-content-wrapper')) : null);
  return media?.closest('[data-id]')?.getAttribute('data-id') ?? null;
};

/** The stored blocks, or undefined for an empty or unparsable string: BlockNote's `initialContent` takes no null. */
export const getParsedContent = (strBlocks: string | null | undefined) => (parseBlocks(strBlocks) as CustomBlock[] | null) ?? undefined;

export const blocksToHTML = (strBlocks: string) => getHeadlessEditor().blocksToHTMLLossy(getParsedContent(strBlocks) ?? []);

/** Writes both HTML (for rich text targets) and Markdown (so code blocks survive in plain-text targets). */
export const copyBlocksToClipboard = async (strBlocks: string | null): Promise<boolean> => {
  const blocks = getParsedContent(strBlocks);
  if (!blocks) return false;

  try {
    const editor = getHeadlessEditor();

    const markdown = editor.blocksToMarkdownLossy(blocks);
    const html = editor.blocksToHTMLLossy(blocks);

    const htmlBlob = new Blob([html], { type: 'text/html' });
    const markdownBlob = new Blob([markdown], { type: 'text/plain' });
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': markdownBlob })]);

    return true;
  } catch {
    return false;
  }
};

/** The outer `transact` carries `addToHistory: false`, which covers both the Yjs UndoManager and ProseMirror history. */
export const updateBlockWithoutHistory = <TEditor extends AnyBlockNoteEditor>(
  editor: TEditor,
  block: Parameters<TEditor['updateBlock']>[0],
  update: Parameters<TEditor['updateBlock']>[1],
) => {
  editor.transact((tr: { setMeta: (key: string, value: boolean) => void }) => {
    tr.setMeta('addToHistory', false);
    editor.updateBlock(block, update);
  });
};
