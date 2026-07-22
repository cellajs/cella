import type { ExtensionFactoryInstance, HeadingOptions } from '@blocknote/core';
import type { DefaultSuggestionItem } from '@blocknote/core/extensions';
import type { FilePanelProps } from '@blocknote/react';
import type React from 'react';
import type { Attachment } from 'sdk';
import type { customSchema } from '~/modules/common/blocknote/blocknote-config';
import type { Member } from '~/modules/memberships/types';

// Extendable BlockNote types interface
export interface ExtendableBlockNoteTypes {
  SlashKeys: DefaultSuggestionItem['key'] | 'notify' | 'checklistItem';
}

export type CustomBlockNoteEditor = typeof customSchema.BlockNoteEditor;
export type CustomBlock = typeof customSchema.Block;

// Define basic block and file types
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

// Icon type for side menu to satisfy custom elements
export type IconType = (
  props: React.SVGAttributes<SVGElement> & {
    children?: React.ReactNode;
    size?: string | number;
    color?: string;
    title?: string;
  },
) => React.ReactElement;

/**
 * Selects whether BlockNote stores a public bucket key or a private attachment ID.
 * Attachment modes persist an entity; private media requires one for permission-scoped access.
 */
export type BlockNoteMediaMode = 'public-no-attachment' | 'public-attachment' | 'private-attachment';

/**
 * Attachment modes require a tenant and completion callback for persistence and private reads.
 * Parsed attachments retain the client IDs referenced by their blocks.
 */
export type BaseUppyFilePanelProps = {
  organizationId: string;
  onComplete?: (attachments: Attachment[]) => void | Promise<void>;
  onError?: (error: Error) => void;
} & (
  | { mediaMode: 'public-no-attachment'; tenantId?: string }
  | { mediaMode: 'public-attachment' | 'private-attachment'; tenantId: string }
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
