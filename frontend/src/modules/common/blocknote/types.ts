import type { customSchema } from '~/modules/common/blocknote/blocknote-config';

export type BlockAlignTypes = 'right' | 'center' | 'left';

export type BlockTypes = 'heading' | 'paragraph' | 'bulletListItem' | 'numberedListItem' | 'checkListItem';
export type BasicStyleTypes = 'bold' | 'italic' | 'underline' | 'strike' | 'code';
export type SlashMenuItems =
  | 'Image'
  | 'Video'
  | 'File'
  | 'Bullet List'
  | 'Numbered List'
  | 'Check List'
  | 'Notify'
  | 'Emoji'
  | 'Table'
  | 'Audio'
  | 'Heading 1'
  | 'Heading 2'
  | 'Heading 3'
  | 'Paragraph';

export type CustomBlockNoteSchema = typeof customSchema.BlockNoteEditor;

export interface CustomFormatToolBarConfig {
  blockTypeSelect?: boolean;
  blockStyleSelect?: boolean;
  blockAlignSelect?: boolean;
  textColorSelect?: boolean;
  blockNestingSelect?: boolean;
  fileCaption?: boolean;
  replaceFile?: boolean;
  createLink?: boolean;
}
