import {
  BlockNoteSchema,
  type CodeBlockOptions,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
  type DefaultSuggestionItem,
  type Dictionary,
} from '@blocknote/core';
import { blockTypeSelectItems, type DefaultReactSuggestionItem, getDefaultReactSlashMenuItems } from '@blocknote/react';

import { MentionSchema } from '~/modules/common/blocknote/custom-elements/mention/mention';
import { getSlashNotifySlashItem, Notify } from '~/modules/common/blocknote/custom-elements/notify';
import { baseBlocknoteTypeToKeys } from '~/modules/common/blocknote/type-to-keys';
import type {
  BlockAlignTypes,
  BlockStyleTypes,
  CommonBlockNoteProps,
  CustomBlockNoteEditor,
  CustomBlockTypes,
  CustomFormatToolBarConfig,
  SlashIndexedItems,
  SlashItemKeys,
} from '~/modules/common/blocknote/types';

/**
 *  Basic Configuration
 */

// Base custom schema
export const customSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, notify: Notify }, // Adds Notify block
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: MentionSchema }, // Adds Mention tag
  styleSpecs: { ...defaultStyleSpecs },
});

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

// Extend Blocknote types to include custom block keys for slash menu
declare module '~/modules/common/blocknote/types' {
  export interface ExtendableBlocknoteTypes {
    SlashKeys: DefaultSuggestionItem['key'] | 'notify';
  }
}

// Default allowed block types
export const allowedTypes: CustomBlockTypes[] = [
  'notify',
  'table',
  'emoji',
  'paragraph',
  'heading',
  'codeBlock',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
  'toggleListItem',
  'image',
  'video',
  'audio',
  'file',
];

// Blocks to witch can be switched
export const customBlockTypeSelectItems: CustomBlockTypes[] = ['heading', 'paragraph', 'bulletListItem', 'numberedListItem', 'checkListItem'];

/**
 *  Side Menu Configuration
 */
// Block types that trigger the side menu when selected
export const sideMenuOpenOnTypes: CustomBlockTypes[] = ['paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem'];

// Generate side menu items based on dictionary input
export const getSideMenuItems = (dict: Dictionary) => [...blockTypeSelectItems(dict)];

/**
 *  Slash Menu Configuration
 */
const typeToBlocknoteKeys: Record<CustomBlockTypes, SlashItemKeys[]> = { ...baseBlocknoteTypeToKeys };

// Indexed items (max 9 for quick number-based selection)
export const customSlashIndexedItems: SlashIndexedItems = ['image', 'video', 'file', 'bulletListItem', 'numberedListItem', 'checkListItem', 'notify'];

// Non-indexed items (accessed via browsing)
export const customSlashNotIndexedItems: CustomBlockTypes[] = [
  'table',
  'audio',
  'heading',
  'paragraph',
  'codeBlock',
  'quote',
  'emoji',
  'toggleListItem',
  'checkListItem',
];

// Generate the complete Slash menu items list
export const getSlashMenuItems = (
  editor: CustomBlockNoteEditor,
  allowedTypes: CustomBlockTypes[],
  headingLevels: NonNullable<CommonBlockNoteProps['headingLevels']>,
): DefaultReactSuggestionItem[] => {
  // Get all available slash items
  const baseItems = [...getDefaultReactSlashMenuItems(editor), getSlashNotifySlashItem(editor)];

  // Filter allowed indexed and non-indexed types once
  const allowedIndexed = customSlashIndexedItems.filter((type) => allowedTypes.includes(type));
  const allowedNotIndexed = customSlashNotIndexedItems.filter((type) => allowedTypes.includes(type));

  // Combine allowed types in order
  const orderedTypes = [...allowedIndexed, ...allowedNotIndexed];

  const { heading, ...restTypeToKeys } = typeToBlocknoteKeys;

  // Filter heading keys like "heading", "heading_2", "toggle_heading_3", etc.
  const filteredHeading = heading.filter((el) => {
    const match = el.match(/(?:_)?(\d)$/); // match ending digit with optional underscore (handles "heading_2" or "toggle_heading_3")
    const level = match ? Number.parseInt(match[1], 10) : 1; // "heading" (no number) defaults to level 1
    return headingLevels.includes(level as 1 | 2 | 3 | 4 | 5 | 6);
  });

  const validTypeToBlocknoteKeys = { ...restTypeToKeys, heading: filteredHeading };

  // Create a sort order map where keys map to their index in orderedTypes
  const sortOrder = new Map(orderedTypes.flatMap((type, index) => validTypeToBlocknoteKeys[type].map((key) => [key, index])));

  // Filter items that have keys present in sortOrder, then sort by that index
  const filteredSortedItems = baseItems
    .filter((item): item is DefaultSuggestionItem & { key: SlashItemKeys } => 'key' in item && sortOrder.has(item.key as SlashItemKeys))
    .sort(({ key: first }, { key: second }) => {
      const aIndex = sortOrder.get(first) ?? Number.POSITIVE_INFINITY;
      const bIndex = sortOrder.get(second) ?? Number.POSITIVE_INFINITY;
      return aIndex - bIndex;
    });

  return filteredSortedItems;
};

/**
 *  Formatting toolbar Configuration
 */

// Toolbar configuration settings
export const customFormattingToolBarConfig: CustomFormatToolBarConfig = {
  blockTypeSelect: false,
  blockStyleSelect: true,
  blockAlignSelect: false,
  textColorSelect: false,
  blockNestingSelect: false,
  fileCaption: true,
  openPreview: true,
  replaceFile: true,
  createLink: true,
};

// Text alignment options available in the Formatting Toolbar
export const formattingToolBarTextAlignItems: BlockAlignTypes[] = ['left', 'center', 'right'];

// Text styles available in the Formatting Toolbar
export const formattingToolBarTextStyleSelect: BlockStyleTypes[] = ['bold', 'italic', 'underline', 'strike', 'code'];

// Blocks that can have formatting styles applied
export const formattingToolBarStyleForBlocks: CustomBlockTypes[] = ['heading', 'paragraph', 'bulletListItem', 'numberedListItem', 'checkListItem'];
