import type { Block } from '@blocknote/core';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import { serverBlockNoteSchema } from 'shared/utils/blocknote-server-schema';

const createEditor = () => ServerBlockNoteEditor.create({ schema: serverBlockNoteSchema });

let editor: ReturnType<typeof createEditor> | undefined;

/**
 * One server editor per process on the shared server schema (the Yjs relay seeds with the same
 * one), created on first use because it boots a jsdom window. Custom blocks and mention inline
 * content convert here; the default schema would throw "node type mention not found".
 */
export function getServerBlockNoteEditor() {
  if (!editor) editor = createEditor();
  return editor;
}

/** Lossy HTML for stored blocks; mentions render as `data-mention-id` spans, the shape mention derivation reads. */
export const blocksToHtml = (blocks: Block[]): Promise<string> => getServerBlockNoteEditor().blocksToHTMLLossy(blocks);
