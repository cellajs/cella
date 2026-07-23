import { type CodeBlockOptions, defaultProps } from '@blocknote/core';

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

/**
 * Media blocks carry a reference to the attachment entity they were uploaded as, so
 * derivation and lifecycle logic read an id prop and never parse URLs. External media
 * (pasted URLs without an attachment row) leave it empty.
 */
export const attachmentRefPropSchema = {
  attachmentId: { default: '' as string },
};

/**
 * Widen a media block spec's props with the attachment reference. Apply to the same
 * specs on every schema that round-trips a shared Y.Doc (frontend editor and Yjs
 * relay), so the ProseMirror node specs stay identical.
 */
export const withAttachmentRef = <S extends { config: { propSchema: Record<string, unknown> } }>(spec: S) => ({
  ...spec,
  config: {
    ...spec.config,
    propSchema: { ...spec.config.propSchema, ...attachmentRefPropSchema },
  },
});

/** Notify variants. Presentation (icons, colors) lives in the frontend's notify-options. */
export const notifyTypeValues = ['warning', 'error', 'info', 'success'] as const;

export const notifyConfig = {
  type: 'notify' as const,
  propSchema: {
    textAlignment: defaultProps.textAlignment,
    textColor: defaultProps.textColor,
    type: { default: notifyTypeValues[0] as string, values: [...notifyTypeValues] as string[] },
  },
  content: 'inline' as const,
};

export const mentionConfig = {
  type: 'mention' as const,
  propSchema: {
    id: { default: 'Unknown' },
    slug: { default: 'Unknown' },
    name: { default: 'Unknown' },
  },
  content: 'none' as const,
};

/** Options for the code block spec: shared so the `language` attribute behaves identically. */
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
