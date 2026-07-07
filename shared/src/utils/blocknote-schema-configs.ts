import { type CodeBlockOptions, defaultProps } from '@blocknote/core';

/**
 * React-free BlockNote schema configs, shared between the frontend editor and the
 * Yjs relay's server-side seeder. Both build their schema from these configs so the
 * ProseMirror node specs (names, attributes, content) stay identical — a seeded
 * Y.Doc must round-trip through the client editor without loss.
 *
 * Render implementations stay in the frontend; the relay pairs these configs with
 * stub renders that are never invoked during block ↔ Y.Doc conversion.
 */

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

export const checklistGroupConfig = {
  type: 'checklistGroup' as const,
  propSchema: {
    textAlignment: defaultProps.textAlignment,
    title: { default: '' as string },
    collapsed: { default: false as boolean },
  },
  content: 'none' as const,
};

/** Notify variants — presentation (icons, colors) lives in the frontend's notify-options. */
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

/** Options for the code block spec — shared so the `language` attribute behaves identically. */
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
