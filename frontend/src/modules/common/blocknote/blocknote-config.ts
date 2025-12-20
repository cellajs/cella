import { codeBlockOptions } from '@blocknote/code-block';
import { BlockNoteSchema, CodeBlockOptions, createCodeBlockSpec, type Dictionary } from '@blocknote/core';
import { DefaultSuggestionItem } from '@blocknote/core/extensions';
import { blockTypeSelectItems, type DefaultReactSuggestionItem, getDefaultReactSlashMenuItems } from '@blocknote/react';
import { MentionSchema } from '~/modules/common/blocknote/custom-elements/mention/mention';
import { getSlashNotifySlashItem, notifyBlock } from '~/modules/common/blocknote/custom-elements/notify';
import { baseBlocknoteTypeToKeys } from '~/modules/common/blocknote/type-to-keys';
import type {
  CommonBlockNoteProps,
  CustomBlockNoteEditor,
  CustomBlockTypes,
  CustomFormatToolBarConfig,
  SlashIndexedItems,
} from '~/modules/common/blocknote/types';

/**
 *  Basic configuration
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
    notify: notifyBlock(), // Adds Notify block
    codeBlock: createCodeBlockSpec({
      indentLineWithTab: true,
      supportedLanguages,
      defaultLanguage: 'text',
      // TODO(BLOCKING) Blocknote type err
      createHighlighter: codeBlockOptions.createHighlighter as any,
    }),
  },
  inlineContentSpecs: { mention: MentionSchema }, // Adds Mention tag
});

// Blocks to witch can be switched by sidemenu btn or in formatting toolbar
export const customBlockTypeSwitchItems: CustomBlockTypes[] = [
  'heading',
  'paragraph',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
];

/**
 *  Side menu configuration
 */
export const getSideMenuItems = (dict: Dictionary) => [...blockTypeSelectItems(dict)];

/**
 *  Slash menu configuration
 */

// Indexed items (max 9 for quick number-based selection)
export const customSlashIndexedItems: SlashIndexedItems = [
  'image',
  'video',
  'file',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
  'notify',
];

// Generate the complete Slash menu items list
export const getSlashMenuItems = (
  editor: CustomBlockNoteEditor,
  allowedTypes: CustomBlockTypes[],
  headingLevels: NonNullable<CommonBlockNoteProps['headingLevels']>,
): DefaultReactSuggestionItem[] => {
  const baseItems = [...getDefaultReactSlashMenuItems(editor), getSlashNotifySlashItem(editor)];

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
  const allowedKeys = Object.values(filteredTypeToKeys).flat();

  // Optional: sort by `customSlashIndexedItems`
  const sortOrder = new Map(
    customSlashIndexedItems
      .filter((type) => allowedTypes.includes(type))
      .flatMap((type, index) => filteredTypeToKeys[type].map((key) => [key, index])),
  );

  return baseItems
    .filter(
      (item): item is DefaultSuggestionItem =>
        'key' in item && allowedKeys.includes(item.key as DefaultSuggestionItem['key']),
    )
    .sort(({ key: first }, { key: second }) => {
      const aIndex = sortOrder.get(first) ?? Number.POSITIVE_INFINITY;
      const bIndex = sortOrder.get(second) ?? Number.POSITIVE_INFINITY;
      return aIndex - bIndex;
    });
};

/**
 *  Formatting toolbar configuration
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
