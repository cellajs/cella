import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core';
import { MentionSchema } from '~/modules/common/blocknote/custom-elements/mention/mention';
import { Notify } from '~/modules/common/blocknote/custom-elements/notify';
import type { BasicStyleTypes, BlockAlignTypes, BlockTypes, CustomFormatToolBarConfig, SlashMenuItems } from '~/modules/common/blocknote/types';

export const customTextAlignItems: BlockAlignTypes[] = ['left', 'center', 'right'];

// blocks in array can be changed in the other types from this array
export const customBlockTypeSelectItems: BlockTypes[] = ['heading', 'paragraph', 'bulletListItem', 'numberedListItem', 'checkListItem'];

// Select with blocks style can be changed and choose to witch style
export const canChangeStyleForBlocks: BlockTypes[] = ['heading', 'paragraph', 'bulletListItem', 'numberedListItem', 'checkListItem'];
export const customTextStyleSelect: BasicStyleTypes[] = ['bold', 'italic', 'underline', 'strike'];

// set not more the 9 cos user cant use the num click to activate it
export const customSlashIndexedItems: SlashMenuItems[] = ['Image', 'Video', 'File', 'Bullet List', 'Numbered List', 'Check List', 'Notify', 'Emoji'];
export const customSlashNotIndexedItems: SlashMenuItems[] = ['Table', 'Audio', 'Heading 1', 'Heading 2', 'Heading 3', 'Paragraph'];

// config for custom formatting bar
// removed text position left|center|right, also indentation & text coloring
export const customFormattingToolBarConfig: CustomFormatToolBarConfig = {
  blockTypeSelect: true,
  blockStyleSelect: true,
  blockAlignSelect: false,
  textColorSelect: true,
  blockNestingSelect: false,
  fileCaption: true,
  replaceFile: true,
  createLink: true,
};

export const customSchema = BlockNoteSchema.create({
  blockSpecs: {
    // Adds all default blocks.
    ...defaultBlockSpecs,
    // Adds the Notify block.
    notify: Notify,
  },
  inlineContentSpecs: {
    // Adds all default inline content.
    ...defaultInlineContentSpecs,
    // Adds the mention tag.
    mention: MentionSchema,
  },
});
