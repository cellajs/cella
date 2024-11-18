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

// default config
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
export const sideMenuOpenOnTypes = ['summary', 'paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem'];

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

// Slash menu
// set not more the 9 cos user cant use the num click to activate it
export const customSlashIndexedItems: MenusItemsTitle[] = ['Image', 'Video', 'File', 'Bullet List', 'Numbered List', 'Check List', 'Notify', 'Emoji'];

export const customSlashNotIndexedItems: MenusItemsTitle[] = ['Table', 'Audio', 'Heading 1', 'Heading 2', 'Heading 3', 'Paragraph', 'Code Block'];

export const getSlashMenuItems = (editor: CustomBlockNoteSchema) => [...getDefaultReactSlashMenuItems(editor), getSlashNotifySlashItem(editor)];

// SideMenu
// blocks in array can be changed in the other types from this array
export const customBlockTypeSelectItems: (BasicBlockTypes | CellaCustomBlockTypes)[] = [
  'heading',
  'paragraph',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
];

export const getSideMenuItems = (dict: Dictionary) => [...blockTypeSelectItems(dict)];

// Formatting toolbar
// removed text position left|center|right, also indentation
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

export const formattingToolBarTextAlignItems: BlockAlignTypes[] = ['left', 'center', 'right'];
export const formattingToolBarTextStyleSelect: BlockStyleTypes[] = ['bold', 'italic', 'underline', 'strike', 'code'];
// blocks type can be changed between self
export const formattingToolBarStyleForBlocks: BasicBlockTypes[] = ['heading', 'paragraph', 'bulletListItem', 'numberedListItem', 'checkListItem'];

export const customSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    notify: Notify, // Notify block
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mention: MentionSchema, // Mention tag
  },
});
