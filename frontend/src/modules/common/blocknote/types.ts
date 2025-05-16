import type { FilePanelProps } from '@blocknote/react';
import type React from 'react';
import type { customSchema, supportedLanguages } from '~/modules/common/blocknote/blocknote-config';
import type { Member } from '~/modules/memberships/types';

export type CustomBlockNoteEditor = typeof customSchema.BlockNoteEditor;
export type CustomBlock = typeof customSchema.Block;

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

type MaxNineItems<T extends string> =
  | [T]
  | [T, T]
  | [T, T, T]
  | [T, T, T, T]
  | [T, T, T, T, T]
  | [T, T, T, T, T, T]
  | [T, T, T, T, T, T, T]
  | [T, T, T, T, T, T, T, T]
  | [T, T, T, T, T, T, T, T, T];
export type SlashIndexedItems = MaxNineItems<MenusItemsTitle>;

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

export type CommonBlockNoteProps = {
  id: string;
  defaultValue?: string; // stringified block
  editable?: boolean;
  className?: string;
  codeBlockDefaultLanguage?: keyof typeof supportedLanguages;
  sideMenu?: boolean;
  slashMenu?: boolean;
  formattingToolbar?: boolean;
  trailingBlock?: boolean;
  altClickOpensPreview?: boolean;
  emojis?: boolean;
  allowedBlockTypes?: (BasicBlockBaseTypes | CellaCustomBlockTypes)[];
  members?: Member[]; // for mentions
  onFocus?: () => void;
  onEscapeClick?: () => void;
  onEnterClick?: () => void;
  onBeforeLoad?: (editor: CustomBlockNoteEditor) => void;
} & (
  | {
      // filePanel and allowedFileBlockTypes must be defined together
      filePanel: (props: FilePanelProps) => React.ReactElement;
      allowedFileBlockTypes?: BasicFileBlockTypes[];
    }
  | {
      filePanel?: never;
      allowedFileBlockTypes?: never;
    }
);
