import {
  type CodeBlockOptions,
  createAudioBlockConfig,
  createFileBlockConfig,
  createImageBlockConfig,
  createVideoBlockConfig,
  defaultProps,
} from '@blocknote/core';
import type { MediaBlockType } from './text-from-block.ts';

export const checklistItemConfig = {
  type: 'checklistItem' as const,
  propSchema: {
    textAlignment: defaultProps.textAlignment,
    textColor: defaultProps.textColor,
    checkboxId: { default: '' as string },
    checked: { default: false as boolean },
  },
  content: 'inline' as const,
};

/** What a media block knows about its file, written when the file enters the document. */
const mediaPropSchema = {
  /** The attachment entity the file was uploaded as, empty for a file without a row. Derivation and lifecycle code read it and never parse URLs. */
  attachmentId: { default: '' as string },
  /** Pixel size of the source image, 0 when unknown: renderers reserve the box before the image loads. */
  width: { default: 0 as number },
  height: { default: 0 as number },
  /**
   * MIME type of the file, empty when unknown. Never `contentType`: BlockNote writes each prop as a `data-` attribute
   * on the block's element, where `data-content-type` holds the block's own type.
   */
  mimeType: { default: '' as string },
  /** Byte size of the file, 0 when unknown. */
  size: { default: 0 as number },
  /** The first characters of a text file, shown where an image shows its preview; empty for any other file. */
  excerpt: { default: '' as string },
};

const withMediaProps = <C extends { propSchema: Record<string, unknown> }>(config: C) => ({
  ...config,
  propSchema: { ...config.propSchema, ...mediaPropSchema },
});

/**
 * The four file-carrying blocks. Every schema that round-trips a shared Y.Doc (the editor and the Yjs relay) builds
 * them from these configs, so their ProseMirror node specs stay identical.
 */
export const mediaBlockConfigs = {
  audio: withMediaProps(createAudioBlockConfig({})),
  file: withMediaProps(createFileBlockConfig()),
  image: withMediaProps(createImageBlockConfig({})),
  video: withMediaProps(createVideoBlockConfig({})),
} satisfies Record<MediaBlockType, unknown>;

/** The block types an app's schemas add to or replace in BlockNote's defaults: a schema that lacks one does not compile. */
export type CustomBlockType = MediaBlockType | 'checklistItem' | 'notify' | 'codeBlock';

/** Presentation lives in the frontend: icons and titles in notify-block, colors in the blocknote styles.css. */
const notifyTypeValues = ['warning', 'error', 'info', 'success'] as const;

export type NotifyType = (typeof notifyTypeValues)[number];

export const notifyConfig = {
  type: 'notify' as const,
  propSchema: {
    textAlignment: defaultProps.textAlignment,
    textColor: defaultProps.textColor,
    type: { default: notifyTypeValues[0], values: notifyTypeValues },
  },
  content: 'inline' as const,
};

export const mentionConfig = {
  type: 'mention' as const,
  propSchema: { id: { default: 'Unknown' }, slug: { default: 'Unknown' }, name: { default: 'Unknown' } },
  content: 'none' as const,
};

/** Shared so the `language` attribute behaves identically everywhere. */
export const codeBlockConfig = {
  indentLineWithTab: true,
  defaultLanguage: 'text' as const,
  supportedLanguages: {
    text: { name: 'Plain Text', aliases: ['text', 'txt', 'plain'] },
    html: { name: 'HTML', aliases: ['htm'] },
    javascript: { name: 'JavaScript', aliases: ['javascript', 'js'] },
    json: { name: 'JSON', aliases: ['json'] },
    jsonc: { name: 'JSON with Comments', aliases: ['jsonc'] },
    markdown: { name: 'Markdown', aliases: ['markdown', 'md'] },
    typescript: { name: 'TypeScript', aliases: ['typescript', 'ts'] },
  },
} satisfies Partial<CodeBlockOptions>;
