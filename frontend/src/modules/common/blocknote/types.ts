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

export type BlockAlignTypes = 'right' | 'center' | 'left';
export type BlockStyleTypes = 'bold' | 'italic' | 'underline' | 'strike' | 'code';

export type CellaCustomBlockTypes = 'notify';
export type BasicFileBlockTypes = 'image' | 'video' | 'audio' | 'file';
export type BasicBlockBaseTypes = 'emoji' | 'table' | 'paragraph' | 'heading' | 'codeBlock' | 'bulletListItem' | 'numberedListItem' | 'checkListItem';
export type BasicBlockTypes = BasicBlockBaseTypes | BasicFileBlockTypes;

export type MenusItemsTitle =
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
  | 'Code Block'
  | 'Paragraph';

// from react-icon to satisfy side menu icon type for custom elements
interface IconBaseProps extends React.SVGAttributes<SVGElement> {
  children?: React.ReactNode;
  size?: string | number;
  color?: string;
  title?: string;
}

export type IconType = (props: IconBaseProps) => JSX.Element;
