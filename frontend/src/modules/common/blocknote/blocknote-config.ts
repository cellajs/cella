import { BlockNoteSchema, type Dictionary, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core';
import { blockTypeSelectItems, getDefaultReactSlashMenuItems } from '@blocknote/react';

import { MentionSchema } from '~/modules/common/blocknote/custom-elements/mention/mention';
import { Notify, getSlashNotifySlashItem } from '~/modules/common/blocknote/custom-elements/notify';

import type {
  BasicBlockBaseTypes,
  BasicBlockTypes,
  BasicFileBlockTypes,
  BlockAlignTypes,
  BlockStyleTypes,
  CellaCustomBlockTypes,
  CustomBlockNoteSchema,
  CustomFormatToolBarConfig,
  MenusItemsTitle,
} from '~/modules/common/blocknote/types';

/**
 *  Basic Configuration
 */

// Custom schema with block specifications and inline content (e.g., Notify block, Mention tag)
export const customSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, notify: Notify }, // Adds Notify block
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: MentionSchema }, // Adds Mention tag
});

// Extend Blocknote types to include custom block types and menu titles
declare module '~/modules/common/blocknote/types' {
  export interface ExtendableBlocknoteTypes {
    BlockTypes: BaseCustomBlockTypes;
    ItemsTitle: BaseMenusItemsTitle;
  }
}

// Default allowed block types and file types
export const allowedFileTypes: BasicFileBlockTypes[] = ['image', 'video', 'audio', 'file'];
export const allowedTypes: (BasicBlockBaseTypes | CellaCustomBlockTypes)[] = [
  'notify',
  'table',
  'emoji',
  'paragraph',
  'heading',
  'codeBlock',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
];

// Mapping menu titles to block types
export const menusTitleToAllowedType = {
  Image: 'image',
  Video: 'video',
  File: 'file',
  'Bullet List': 'bulletListItem',
  'Numbered List': 'numberedListItem',
  'Check List': 'checkListItem',
  Notify: 'notify',
  Emoji: 'emoji',
  Table: 'table',
  Audio: 'audio',
  'Heading 1': 'heading',
  'Heading 2': 'heading',
  'Heading 3': 'heading',
  'Code Block': 'codeBlock',
  Paragraph: 'paragraph',
};

/**
 *  Side Menu Configuration
 */

// Blocks that can be switched
export const customBlockTypeSelectItems: (BasicBlockTypes | CellaCustomBlockTypes)[] = [
  'heading',
  'paragraph',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
];

// Block types that trigger the side menu when selected
export const sideMenuOpenOnTypes: (BasicBlockTypes | CellaCustomBlockTypes)[] = [
  'paragraph',
  'heading',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
];

// Generate side menu items based on dictionary input
export const getSideMenuItems = (dict: Dictionary) => [...blockTypeSelectItems(dict)];

/**
 *  Slash Menu Configuration
 */

// Indexed items (max 9 for quick number-based selection)
export const customSlashIndexedItems: MenusItemsTitle[] = ['Image', 'Video', 'File', 'Bullet List', 'Numbered List', 'Check List', 'Notify', 'Emoji'];

// Non-indexed items (accessed via browsing)
export const customSlashNotIndexedItems: MenusItemsTitle[] = ['Table', 'Audio', 'Heading 1', 'Heading 2', 'Heading 3', 'Paragraph', 'Code Block'];

// Generate the complete Slash menu items list
export const getSlashMenuItems = (editor: CustomBlockNoteSchema) => [...getDefaultReactSlashMenuItems(editor), getSlashNotifySlashItem(editor)];

/**
 *  Formatting toolbar Configuration
 */

// Toolbar configuration settings
export const customFormattingToolBarConfig: CustomFormatToolBarConfig = {
  blockTypeSelect: false,
  blockStyleSelect: true,
  blockAlignSelect: false,
  textColorSelect: true,
  blockNestingSelect: false,
  fileCaption: true,
  replaceFile: true,
  createLink: true,
};

// Text alignment options available in the Formatting Toolbar
export const formattingToolBarTextAlignItems: BlockAlignTypes[] = ['left', 'center', 'right'];

// Text styles available in the Formatting Toolbar
export const formattingToolBarTextStyleSelect: BlockStyleTypes[] = ['bold', 'italic', 'underline', 'strike', 'code'];

// Blocks that can have formatting styles applied
export const formattingToolBarStyleForBlocks: BasicBlockTypes[] = ['heading', 'paragraph', 'bulletListItem', 'numberedListItem', 'checkListItem'];
