import {
  BlockNoteSchema,
  createBlockSpec,
  createCodeBlockSpec,
  createInlineContentSpec,
  defaultBlockSpecs,
} from '@blocknote/core';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  checklistItemConfig,
  codeBlockConfig,
  mentionConfig,
  notifyConfig,
  withAttachmentRef,
} from 'shared/utils/blocknote-schema-configs';
import * as Y from 'yjs';
import { log } from './pino';

/** Fragment name the client editor binds to: must match yjs-connections.ts in the frontend. */
export const YJS_FRAGMENT_NAME = 'document-store';

/** Stub render satisfying the spec factory signature: block to Y.Doc conversion never renders. */
const serverRender = () => {
  throw new Error('BlockNote render is not available in the Yjs relay');
};

/** Mirror of the frontend custom schema (blocknote-config.ts), from the same shared configs: the ProseMirror node specs must stay identical for round-tripping. */
const serverSchema = BlockNoteSchema.create().extend({
  blockSpecs: {
    audio: withAttachmentRef(defaultBlockSpecs.audio),
    file: withAttachmentRef(defaultBlockSpecs.file),
    image: withAttachmentRef(defaultBlockSpecs.image),
    video: withAttachmentRef(defaultBlockSpecs.video),
    checklistItem: createBlockSpec(checklistItemConfig, { render: serverRender })(),
    notify: createBlockSpec(notifyConfig, { render: serverRender })(),
    // No highlighter server-side: only the node spec matters for seeding.
    codeBlock: createCodeBlockSpec(codeBlockConfig),
  },
  inlineContentSpecs: {
    mention: createInlineContentSpec(mentionConfig, { render: serverRender }),
  },
});

// One shared editor instance: schema construction is expensive and conversions are stateless.
const editor = ServerBlockNoteEditor.create({ schema: serverSchema });

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
