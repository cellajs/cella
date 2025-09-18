import type { BlockNoteEditorOptions } from '@blocknote/core';
import type { FilePanelProps } from '@blocknote/react';
import type React from 'react';
import type { customSchema, supportedLanguages } from '~/modules/common/blocknote/blocknote-config';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import type { Member } from '~/modules/memberships/types';

type CustomSchema = typeof customSchema;
export type CustomBlockNoteEditor = typeof customSchema.BlockNoteEditor;
export type CustomBlock = typeof customSchema.Block;

// Define basic block and file types
export type CustomBlockTypes = CustomBlock['type'] | 'emoji';
export type CustomBlockFileTypes = Extract<CustomBlockTypes, 'file' | 'image' | 'audio' | 'video'>;
export type CustomBlockRegularTypes = Exclude<CustomBlockTypes, CustomBlockFileTypes>;

export type SlashItemKeys = ExtendableBlocknoteTypes['SlashKeys'];
export interface CustomFormatToolBarConfig {
  blockTypeSelect?: boolean;
  blockStyleSelect?: boolean;
  blockAlignSelect?: boolean;
  textColorSelect?: boolean;
  blockNestingSelect?: boolean;
  fileCaption?: boolean;
  openPreview?: boolean;
  createLink?: boolean;
}

// Define types for block alignment and styles
export type BlockAlignTypes = 'right' | 'center' | 'left';
export type BlockStyleTypes = 'bold' | 'italic' | 'underline' | 'strike' | 'code';

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
export type SlashIndexedItems = MaxNineItems<CustomBlockTypes>;

// Icon type for side menu to satisfy custom elements
export type IconType = (
  props: React.SVGAttributes<SVGElement> & {
    children?: React.ReactNode;
    size?: string | number;
    color?: string;
    title?: string;
  },
) => React.ReactElement;

export type BaseUppyFilePanelProps = {
  organizationId: string;
  isPublic?: boolean;
  onComplete?: (result: UploadedUppyFile<'attachment'>) => void;
  onError?: (error: Error) => void;
};

export type CommonBlockNoteProps = {
  id: string;
  defaultValue?: string; // stringified block
  editable?: boolean;
  className?: string;
  codeBlockDefaultLanguage?: keyof typeof supportedLanguages;
  headingLevels?: NonNullable<
    BlockNoteEditorOptions<CustomSchema['blockSchema'], CustomSchema['inlineContentSchema'], CustomSchema['styleSchema']>['heading']
  >['levels'];
  sideMenu?: boolean;
  slashMenu?: boolean;
  formattingToolbar?: boolean;
  trailingBlock?: boolean;
  clickOpensPreview?: boolean;
  emojis?: boolean;
  excludeBlockTypes?: CustomBlockRegularTypes[];
  excludeFileBlockTypes?: CustomBlockFileTypes[];
  members?: Member[]; // for mentions
  onFocus?: () => void;
  onEscapeClick?: () => void;
  onEnterClick?: () => void;
  onBeforeLoad?: (editor: CustomBlockNoteEditor) => void;
} & (
  | { filePanel: (props: FilePanelProps) => React.ReactElement; baseFilePanelProps?: never }
  | { filePanel?: never; baseFilePanelProps: BaseUppyFilePanelProps }
  | { filePanel?: never; baseFilePanelProps?: never }
);

export type CustomBlockNoteMenuProps = {
  editor: CustomBlockNoteEditor;
  allowedTypes: CustomBlockTypes[];
  headingLevels: NonNullable<CommonBlockNoteProps['headingLevels']>;
};
