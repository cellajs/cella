import {
  BlockNoteSchema,
  type CustomInlineContentImplementation,
  createBlockSpec,
  createCodeBlockSpec,
  createInlineContentSpec,
  defaultBlockSpecs,
  type StyleSchema,
} from '@blocknote/core';
import { checklistItemConfig, codeBlockConfig, mentionConfig, notifyConfig, withAttachmentRef } from './blocknote-schema-configs.ts';

type MentionImplementation = CustomInlineContentImplementation<typeof mentionConfig, StyleSchema>;
/** BlockNote's `HTMLElement` plus the two members used here, spelled out because workers compile without the DOM lib. */
type RenderedDom = ReturnType<MentionImplementation['render']>['dom'] & {
  setAttribute(name: string, value: string): void;
  textContent: string | null;
};

/** The DOM document a render creates its elements in, which a server process has only where a caller installs one. */
type ServerDocument = { createElement(tag: string): RenderedDom };

/**
 * Renders exist because `createBlockSpec` requires one. They run only when a caller converts blocks to HTML; converting
 * between blocks and a Y.Doc never renders.
 */
const serverDocument = (): ServerDocument => {
  const { document } = globalThis as { document?: ServerDocument };
  if (!document) throw new Error('BlockNote server render needs a DOM document on globalThis');
  return document;
};

/** Inline-content blocks render as a plain container, so their text survives server HTML conversion. */
const renderInlineBlock = () => {
  const dom = serverDocument().createElement('div');
  return { dom, contentDOM: dom };
};

/**
 * Mention as the `data-mention-id` span the frontend renders, so server-side HTML keeps the id
 * mention derivation reads.
 */
const renderMention: MentionImplementation['render'] = (inlineContent) => {
  const dom = serverDocument().createElement('span');
  dom.setAttribute('data-mention-id', inlineContent.props.id);
  dom.textContent = `@ ${inlineContent.props.name}`;
  return { dom };
};

/**
 * The backend's schema for converting between blocks and a Y.Doc, mirroring the frontend editor's (`blocknote-schema.ts`)
 * from the same shared configs: the ProseMirror node specs must stay identical for Y.Doc round-tripping, and a body
 * containing a mention converts (the default schema throws "node type mention not found").
 */
export const serverBlockNoteSchema = BlockNoteSchema.create().extend({
  blockSpecs: {
    audio: withAttachmentRef(defaultBlockSpecs.audio),
    file: withAttachmentRef(defaultBlockSpecs.file),
    image: withAttachmentRef(defaultBlockSpecs.image),
    video: withAttachmentRef(defaultBlockSpecs.video),
    checklistItem: createBlockSpec(checklistItemConfig, { render: renderInlineBlock })(),
    notify: createBlockSpec(notifyConfig, { render: renderInlineBlock })(),
    // No highlighter server-side: only the node spec matters.
    codeBlock: createCodeBlockSpec(codeBlockConfig),
  },
  inlineContentSpecs: { mention: createInlineContentSpec(mentionConfig, { render: renderMention }) },
});
