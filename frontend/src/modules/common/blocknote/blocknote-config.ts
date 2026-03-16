import { codeBlockOptions } from '@blocknote/code-block';
import { BlockNoteSchema, CodeBlockOptions, createCodeBlockSpec, type Dictionary } from '@blocknote/core';
import { DefaultSuggestionItem } from '@blocknote/core/extensions';
import { blockTypeSelectItems, type DefaultReactSuggestionItem, getDefaultReactSlashMenuItems } from '@blocknote/react';
import {
  checklistItemBlock,
  getChecklistSlashItem,
} from '~/modules/common/blocknote/custom-elements/checklist/checklist-item-block';
import { MentionSchema } from '~/modules/common/blocknote/custom-elements/mention/mention';
import { getSlashNotifySlashItem, notifyBlock } from '~/modules/common/blocknote/custom-elements/notify/notify-block';
import { baseBlocknoteTypeToKeys } from '~/modules/common/blocknote/type-to-keys';
import type {
  CommonBlockNoteProps,
  CustomBlockNoteEditor,
  CustomBlockTypes,
  CustomFormatToolBarConfig,
  SlashIndexedItems,
} from '~/modules/common/blocknote/types';

/**
 *  Basic Configuration
 */

// Config for supported languages for BlockNote code blocks
export const supportedLanguages = {
  text: {
    name: 'Plain Text',
    aliases: ['text', 'txt', 'plain'],
  },
  html: {
    name: 'HTML',
    aliases: ['htm'],
  },
  javascript: {
    name: 'JavaScript',
    aliases: ['javascript', 'js'],
  },
  json: {
    name: 'JSON',
    aliases: ['json'],
  },
  jsonc: {
    name: 'JSON with Comments',
    aliases: ['jsonc'],
  },
  markdown: {
    name: 'Markdown',
    aliases: ['markdown', 'md'],
  },
  typescript: {
    name: 'TypeScript',
    aliases: ['typescript', 'ts'],
  },
} satisfies CodeBlockOptions['supportedLanguages'];

// Base custom schema
export const customSchema = BlockNoteSchema.create().extend({
  blockSpecs: {
    checklistItem: checklistItemBlock(),
    notify: notifyBlock(), // Adds Notify block
    codeBlock: createCodeBlockSpec({
      indentLineWithTab: true,
      supportedLanguages,
      defaultLanguage: 'text',
      createHighlighter: codeBlockOptions.createHighlighter,
    }),
  },
  inlineContentSpecs: { mention: MentionSchema },
});

// Blocks to which can be switched by sidemenu btn or in formatting toolbar
export const customBlockTypeSwitchItems: CustomBlockTypes[] = [
  'heading',
  'paragraph',
  'bulletListItem',
  'numberedListItem',
  'checklistItem',
];

/**
 *  Side Menu Configuration
 */
export const getSideMenuItems = (dict: Dictionary) => [...blockTypeSelectItems(dict)];

/**
 *  Slash Menu Configuration
 */

// Indexed items (max 9 for quick number-based selection)
export const customSlashIndexedItems: SlashIndexedItems = [
  'image',
  'video',
  'file',
  'bulletListItem',
  'numberedListItem',
  'checklistItem',
  'notify',
];

// Generate the complete Slash menu items list
export const getSlashMenuItems = (
  editor: CustomBlockNoteEditor,
  allowedTypes: CustomBlockTypes[],
  headingLevels: NonNullable<CommonBlockNoteProps['headingLevels']>,
): DefaultReactSuggestionItem[] => {
  const baseItems = [
    ...getDefaultReactSlashMenuItems(editor),
    getSlashNotifySlashItem(editor),
    getChecklistSlashItem(editor),
  ];

  // Filter heading keys based on allowed headingLevels
  const { heading, ...restTypeToKeys } = { ...baseBlocknoteTypeToKeys };
  const filteredHeading = heading.filter((key) => {
    const match = key.match(/(?:_)?(\d)$/);
    const level = match ? Number.parseInt(match[1], 10) : 1;
    return headingLevels.includes(level as (typeof headingLevels)[number]);
  });

  // Build a map of allowed types to keys
  const allowedTypeToKeys = {
    ...restTypeToKeys,
    heading: filteredHeading,
  };

  // Only keep types that are allowed
  const filteredTypeToKeys = Object.fromEntries(
    Object.entries(allowedTypeToKeys).filter(([type]) => allowedTypes.includes(type as CustomBlockTypes)),
  );

  // Flatten the keys to filter baseItems
  const allowedKeys: Set<string> = new Set(Object.values(filteredTypeToKeys).flat());

  // Optional: sort by `customSlashIndexedItems`
  const sortOrder = new Map<string, number>(
    customSlashIndexedItems
      .filter((type) => allowedTypes.includes(type))
      .flatMap((type, index) => filteredTypeToKeys[type].map((key) => [key, index] as const)),
  );

  return baseItems
    .filter((item): item is DefaultSuggestionItem => 'key' in item && allowedKeys.has(item.key as string))
    .sort(({ key: first }, { key: second }) => {
      const aIndex = sortOrder.get(first) ?? Number.POSITIVE_INFINITY;
      const bIndex = sortOrder.get(second) ?? Number.POSITIVE_INFINITY;
      return aIndex - bIndex;
    });
};

/**
 *  Formatting toolbar Configuration
 */
export const customFormattingToolBarConfig: CustomFormatToolBarConfig = {
  blockTypeSelect: false,
  blockStyleSelect: true,
  blockAlignSelect: false,
  textColorSelect: false,
  blockNestingSelect: false,
  fileCaption: true,
  openPreview: true,
  createLink: true,
};
