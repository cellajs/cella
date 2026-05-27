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

/**
 * Update a block without recording it in the undo/redo history.
 * Works in both collaborative (Yjs UndoManager) and non-collaborative (ProseMirror history) modes.
 * Uses BlockNote's `transact` so the outer transaction carries `addToHistory: false`.
 */
type Editor = ReturnType<typeof BlockNoteEditor.create>;

export const updateBlockWithoutHistory = (
  editor: Editor,
  blockId: Parameters<Editor['updateBlock']>[0],
  update: Parameters<Editor['updateBlock']>[1],
) => {
  editor.transact((tr: { setMeta: (key: string, value: boolean) => void }) => {
    tr.setMeta('addToHistory', false);
    editor.updateBlock(blockId, update);
  });
};

/**
 * Clear the Yjs UndoManager stacks (undo + redo) so programmatic seeding
 * doesn't pollute the user's undo history. No-op if not in collaborative mode.
 */
export const clearYjsUndoManagerStacks = (editor: Editor) => {
  try {
    const yUndoExt = editor.extensions.get('yUndo');
    if (!yUndoExt) return;

    // The yUndo ProseMirror plugin stores the UndoManager in the plugin state
    // Access it via: pluginKey.getState(editorState).undoManager
    for (const plugin of editor.prosemirrorState.plugins) {
      const state = plugin.getState(editor.prosemirrorState) as { undoManager?: { clear: () => void } } | undefined;
      if (state?.undoManager?.clear) {
        state.undoManager.clear();
        return;
      }
    }
  } catch {
    // Silently fail — undo history pollution is non-critical
  }
};
