import { BlockNoteSchema, createBlockSpec, createCodeBlockSpec, createInlineContentSpec } from '@blocknote/core';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  checklistItemConfig,
  codeBlockConfig,
  mentionConfig,
  notifyConfig,
} from 'shared/utils/blocknote-schema-configs';
import * as Y from 'yjs';
import { log } from './pino';

/** Fragment name the client editor binds to: must match yjs-connections.ts in the frontend. */
export const YJS_FRAGMENT_NAME = 'document-store';

/**
 * Stub render for server-side specs. Block ↔ Y.Doc conversion never renders,
 * so this only exists to satisfy the spec factory signature.
 */
const serverRender = () => {
  throw new Error('BlockNote render is not available in the Yjs relay');
};

/**
 * Server-side mirror of the frontend's custom schema, built from the same shared
 * configs (shared/blocknote-schema-configs) so the ProseMirror node specs are
 * identical: a doc seeded here must round-trip through the client editor.
 */
const serverSchema = BlockNoteSchema.create().extend({
  blockSpecs: {
    checklistItem: createBlockSpec(checklistItemConfig, { render: serverRender })(),
    notify: createBlockSpec(notifyConfig, { render: serverRender })(),
    // No highlighter server-side: only the node spec matters for seeding
    codeBlock: createCodeBlockSpec(codeBlockConfig),
  },
  inlineContentSpecs: {
    mention: createInlineContentSpec(mentionConfig, { render: serverRender }),
  },
});

// Reuse a single editor instance: schema construction is expensive, conversions are stateless
const editor = ServerBlockNoteEditor.create({ schema: serverSchema });

/**
 * Convert a stored BlockNote description (JSON string of blocks) into a Y.Doc
 * update that seeds a fresh collaborative session. Returns null when there is
 * nothing to seed (empty/invalid description); the session then starts empty.
 */
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
