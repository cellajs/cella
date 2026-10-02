import { type Block, BlockNoteEditor, type PartialBlock } from '@blocknote/core';
import { blocksToYDoc, blocksToYXmlFragment, yDocToBlocks } from '@blocknote/core/yjs';
import { serverBlockNoteSchema } from 'shared/utils/blocknote-server-schema';
import * as Y from 'yjs';

/** Fragment name the client editor binds to: must match yjs-connections.ts in the frontend. */
export const YJS_FRAGMENT_NAME = 'document-store';

const createServerEditor = () => BlockNoteEditor.create({ schema: serverBlockNoteSchema });

let serverEditor: ReturnType<typeof createServerEditor> | undefined;

/**
 * One editor for every conversion, built on first use: schema construction is expensive and conversions are stateless.
 * Converting between blocks and a Y.Doc never renders, so BlockNote core runs here with no DOM and no jsdom.
 */
const editor = () => {
  serverEditor ??= createServerEditor();
  return serverEditor;
};

type ServerSchema = ReturnType<typeof createServerEditor>['schema'];
type ServerBlock = Block<ServerSchema['blockSchema'], ServerSchema['inlineContentSchema'], ServerSchema['styleSchema']>;
type ServerPartialBlock = PartialBlock<ServerSchema['blockSchema'], ServerSchema['inlineContentSchema'], ServerSchema['styleSchema']>;

/**
 * The empty document: one empty paragraph, under the id BlockNote gives the first block of a collaborative document,
 * so a null write onto a document seeded from null changes nothing.
 */
const emptyDocument = (): ServerPartialBlock[] => [{ id: 'initialBlockId', type: 'paragraph' }];

/**
 * The blocks a stored description holds, or the empty document for none (null, empty, `[]`): from an empty fragment,
 * two concurrent first writers create two top-level block groups, of which the editor shows one. Throws when the
 * description is not a JSON array.
 */
function parseDescription(description: string | null): ServerPartialBlock[] {
  if (!description) return emptyDocument();
  const blocks: unknown = JSON.parse(description);
  if (!Array.isArray(blocks)) throw new Error('A description is a JSON array of blocks');
  return blocks.length === 0 ? emptyDocument() : blocks;
}

/**
 * The seed of a new document: its description as one Yjs update, and one empty paragraph for none. Throws when the
 * description does not convert: not a blocks array, or a block or inline type the server schema lacks.
 */
export function descriptionToSeed(description: string | null): Uint8Array {
  const doc = blocksToYDoc(editor(), parseDescription(description), YJS_FRAGMENT_NAME);
  try {
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}

/**
 * The Yjs update that turns `state` (a document's base and log, merged) into `description`. The blocks are diffed into
 * the fragment, so a block the description leaves as it is keeps its elements, and an edit made in it concurrently
 * merges. The update is the conversion transaction's own `update` event, and null when nothing changes: encoding the
 * document against its earlier state vector would carry its whole delete set, a change on every write. Throws when the
 * description does not convert, and then there is nothing to append.
 */
export function descriptionToUpdate(state: Uint8Array | null, description: string | null): Uint8Array | null {
  const blocks = parseDescription(description);
  const doc = new Y.Doc();
  try {
    if (state && state.length > 0) Y.applyUpdate(doc, state);
    const updates: Uint8Array[] = [];
    doc.on('update', (update: Uint8Array) => updates.push(update));
    // The fragment converter types full blocks; it fills a partial block's defaults like the seed converter.
    doc.transact(() => blocksToYXmlFragment(editor(), blocks as ServerBlock[], doc.getXmlFragment(YJS_FRAGMENT_NAME)));
    if (updates.length === 0) return null;
    return updates.length === 1 ? updates[0] : Y.mergeUpdates(updates);
  } finally {
    doc.destroy();
  }
}

/** The blocks JSON a document state holds, as the entity stores its description. Throws when the state does not parse. */
export function stateToBlocksJson(state: Uint8Array): string {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, state);
    return JSON.stringify(yDocToBlocks(editor(), doc, YJS_FRAGMENT_NAME));
  } finally {
    doc.destroy();
  }
}
