import {
  BlockNoteSchema,
  type CodeBlockOptions,
  type DefaultSuggestionItem,
  type Dictionary,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from '@blocknote/core';
import { blockTypeSelectItems, getDefaultReactSlashMenuItems } from '@blocknote/react';

import { MentionSchema } from '~/modules/common/blocknote/custom-elements/mention/mention';
import { Notify, getSlashNotifySlashItem } from '~/modules/common/blocknote/custom-elements/notify';

import type {
  BlockAlignTypes,
  BlockStyleTypes,
  CustomBlockNoteEditor,
  CustomBlockTypes,
  CustomFormatToolBarConfig,
  SlashIndexedItemsKeys,
  SlashItemKeys,
} from '~/modules/common/blocknote/types';

/**
 *  Basic Configuration
 */

// Custom schema with block specifications and inline content (e.g., Notify block, Mention tag)
export const customSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, notify: Notify }, // Adds Notify block
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: MentionSchema }, // Adds Mention tag
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

// Extend Blocknote types to include custom block types and menu titles
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
  'image',
  'video',
  'audio',
  'file',
];

/**
 *  Side Menu Configuration
 */

// Blocks to witch can be switched
export const customBlockTypeSelectItems: CustomBlockTypes[] = ['heading', 'paragraph', 'bulletListItem', 'numberedListItem', 'checkListItem'];

// Block types that trigger the side menu when selected
export const sideMenuOpenOnTypes: CustomBlockTypes[] = ['paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem'];

// Generate side menu items based on dictionary input
export const getSideMenuItems = (dict: Dictionary) => [...blockTypeSelectItems(dict)];

/**
 *  Slash Menu Configuration
 */

// Indexed items (max 9 for quick number-based selection)
export const customSlashIndexedItems: SlashIndexedItemsKeys = [
  'image',
  'video',
  'file',
  'bullet_list',
  'numbered_list',
  'check_list',
  'notify',
  'emoji',
];

// Non-indexed items (accessed via browsing)
export const customSlashNotIndexedItems: SlashItemKeys[] = [
  'table',
  'audio',
  'heading',
  'heading_2',
  'heading_3',
  'paragraph',
  'code_block',
  'quote',
];

// Generate the complete Slash menu items list
export const getSlashMenuItems = (editor: CustomBlockNoteEditor) => [...getDefaultReactSlashMenuItems(editor), getSlashNotifySlashItem(editor)];

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
