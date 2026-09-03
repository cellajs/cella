import { ServerBlockNoteEditor } from '@blocknote/server-util';
import { serverBlockNoteSchema } from 'shared/utils/blocknote-server-schema';
import * as Y from 'yjs';
import { log } from './pino';

/** Fragment name the client editor binds to: must match yjs-connections.ts in the frontend. */
export const YJS_FRAGMENT_NAME = 'document-store';

// One shared editor instance: schema construction is expensive and conversions are stateless.
const editor = ServerBlockNoteEditor.create({ schema: serverBlockNoteSchema });

/** Converts a stored blocks JSON description into a seed update for a fresh session; null when the description is empty or invalid, and the session starts empty. */
export function descriptionToYUpdate(description: string | null): Uint8Array | null {
  if (!description) return null;
  try {
    const blocks = JSON.parse(description);
    if (!Array.isArray(blocks) || blocks.length === 0) return null;
    const ydoc = editor.blocksToYDoc(blocks, YJS_FRAGMENT_NAME);
    return Y.encodeStateAsUpdate(ydoc);
  } catch (err) {
    log.warn('Failed to convert description to Y.Doc seed', { err });
    return null;
  }
}

/** Read a Y.Doc update back into BlockNote blocks: the inverse of {@link descriptionToYUpdate}. */
export function yUpdateToBlocks(update: Uint8Array) {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, update);
  return editor.yDocToBlocks(ydoc, YJS_FRAGMENT_NAME);
}
