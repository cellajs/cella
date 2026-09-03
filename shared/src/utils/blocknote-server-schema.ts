import {
  BlockNoteSchema,
  type CustomInlineContentImplementation,
  createBlockSpec,
  createCodeBlockSpec,
  createInlineContentSpec,
  defaultBlockSpecs,
  type StyleSchema,
} from '@blocknote/core';
import {
  checklistItemConfig,
  codeBlockConfig,
  mentionConfig,
  notifyConfig,
  withAttachmentRef,
} from './blocknote-schema-configs';

type MentionImplementation = CustomInlineContentImplementation<typeof mentionConfig, StyleSchema>;
/** BlockNote's `HTMLElement` plus the two members used here, spelled out because workers compile without the DOM lib. */
type RenderedDom = ReturnType<MentionImplementation['render']>['dom'] & {
  setAttribute(name: string, value: string): void;
  textContent: string | null;
};

/** The document `ServerBlockNoteEditor` installs on `globalThis` for the duration of an HTML conversion. */
type ServerDocument = { createElement(tag: string): RenderedDom };

/** Renders run only inside `blocksToHTMLLossy` and friends (block to Y.Doc conversion never renders). */
const serverDocument = (): ServerDocument => {
  const { document } = globalThis as { document?: ServerDocument };
  if (!document) throw new Error('BlockNote server render needs the jsdom document ServerBlockNoteEditor installs');
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
 * Server mirror of the frontend custom schema (`blocknote-config.ts`), from the same shared configs:
 * the ProseMirror node specs must stay identical for Y.Doc round-tripping. One schema for every
 * `ServerBlockNoteEditor` (Yjs relay seeding, backend HTML conversion), so a body containing a
 * mention converts everywhere (the default schema throws "node type mention not found").
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
  inlineContentSpecs: {
    mention: createInlineContentSpec(mentionConfig, { render: renderMention }),
  },
});
