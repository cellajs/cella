import type React from 'react';
import type { customSchema } from '~/modules/common/blocknote/blocknote-config';

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

// Define types for block alignment and styles
export type BlockAlignTypes = 'right' | 'center' | 'left';
export type BlockStyleTypes = 'bold' | 'italic' | 'underline' | 'strike' | 'code';

// Define basic block and file types
export type BasicFileBlockTypes = 'image' | 'video' | 'audio' | 'file';
export type BasicBlockBaseTypes = 'emoji' | 'table' | 'paragraph' | 'heading' | 'codeBlock' | 'bulletListItem' | 'numberedListItem' | 'checkListItem';
export type BasicBlockTypes = BasicBlockBaseTypes | BasicFileBlockTypes;

// Icon type for side menu to satisfy custom elements
export type IconType = (
  props: React.SVGAttributes<SVGElement> & {
    children?: React.ReactNode;
    size?: string | number;
    color?: string;
    title?: string;
  },
) => React.ReactElement;

export type BaseCustomBlockTypes = 'notify';
export type BaseMenusItemsTitle =
  | 'Image'
  | 'Video'
  | 'File'
  | 'Bullet List'
  | 'Numbered List'
  | 'Check List'
  | 'Notify'
  | 'Code Block'
  | 'Emoji'
  | 'Table'
  | 'Audio'
  | 'Heading 1'
  | 'Heading 2'
  | 'Heading 3'
  | 'Paragraph';

// Combine base types with extended types
export type CellaCustomBlockTypes = ExtendableBlocknoteTypes['BlockTypes'];
export type MenusItemsTitle = ExtendableBlocknoteTypes['ItemsTitle'];
