import type { ExtensionFactoryInstance, HeadingOptions } from '@blocknote/core';
import type { DefaultSuggestionItem } from '@blocknote/core/extensions';
import type { FilePanelProps } from '@blocknote/react';
import type React from 'react';
import type { Attachment } from 'sdk';
import type { UploadTemplateId } from 'shared';
import type { customSchema } from '~/modules/common/blocknote/blocknote-config';
import type { Member } from '~/modules/memberships/types';

export interface ExtendableBlockNoteTypes {
  SlashKeys: DefaultSuggestionItem['key'] | 'notify' | 'checklistItem';
}

export type CustomBlockNoteEditor = typeof customSchema.BlockNoteEditor;
export type CustomBlock = typeof customSchema.Block;

export type CustomBlockTypes = CustomBlock['type'] | 'emoji';
export type CustomBlockFileTypes = Extract<CustomBlockTypes, 'file' | 'image' | 'audio' | 'video'>;
export type CustomBlockRegularTypes = Exclude<CustomBlockTypes, CustomBlockFileTypes>;

export type SlashItemKeys = ExtendableBlockNoteTypes['SlashKeys'];
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

export type IconType = (
  props: React.SVGAttributes<SVGElement> & {
    children?: React.ReactNode;
    size?: string | number;
    color?: string;
    title?: string;
  },
) => React.ReactElement;

/** How an upload is referenced: by attachment id, or by cloud key when its upload template stores publicly (the template decides). */
export type BlockNoteMediaMode = 'public-no-attachment' | 'public-attachment' | 'private-attachment';

/**
 * Attachment modes upload through the attachment template and require a tenantId for persistence and private reads.
 * `public-no-attachment` persists no row: it uploads through its own public `templateId` and the block keeps the key.
 */
export type BaseUppyFilePanelProps = {
  /** Storage prefix of the document's media: its organization id, or `systemUploadPrefix` for a system document. */
  organizationId: string;
  onComplete?: (attachments: Attachment[]) => void | Promise<void>;
  onError?: (error: Error) => void;
} & (
  | { mediaMode: 'public-no-attachment'; templateId: UploadTemplateId; tenantId?: string }
  | { mediaMode: 'public-attachment' | 'private-attachment'; templateId?: never; tenantId: string }
);

export type CommonBlockNoteProps = {
  id: string;
  defaultValue?: string; // stringified block
  editable?: boolean;
  className?: string;
  headingLevels?: NonNullable<HeadingOptions['defaultLevel']>[];
  sideMenu?: boolean;
  slashMenu?: boolean;
  formattingToolbar?: boolean;
  trailingBlock?: boolean;
  clickOpensPreview?: boolean;
  dense?: boolean;
  emojis?: boolean;
  excludeBlockTypes?: CustomBlockRegularTypes[];
  excludeFileBlockTypes?: CustomBlockFileTypes[];
  /**
   * Placeholder text layered over the locale's. As in BlockNote, a block-type key labels every empty block of
   * that type, `default` the focused empty block and `emptyDocument` an empty document. `title` labels only an
   * empty heading in block 0, so a title document's body headings keep their own label.
   */
  placeholders?: Partial<Record<CustomBlockTypes | 'default' | 'emptyDocument' | 'title', string>>;
  extensions?: ExtensionFactoryInstance[];
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

/** Heading level of a title document's block 0 (helpers/title-document). */
export type TitleLevel = 1 | 2 | 3;
