import type { ExtensionFactoryInstance, HeadingOptions } from '@blocknote/core';
import type { DefaultSuggestionItem } from '@blocknote/core/extensions';
import type { FilePanelProps } from '@blocknote/react';
import type React from 'react';
import type { Attachment } from 'sdk';
import type { customSchema } from '~/modules/common/blocknote/blocknote-config';
import type { Member } from '~/modules/memberships/types';

// Extendable Blocknote types interface
export interface ExtendableBlocknoteTypes {
  SlashKeys: DefaultSuggestionItem['key'] | 'notify' | 'checklistItem';
}

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
 * How a BlockNote file upload is stored and later resolved. The context picks one
 * cleanly; the read path never needs it (a slashed cloud key resolves via CDN, a
 * UUID attachment id via presigning):
 * - `public-no-attachment`: public bucket, no entity, block stores the key → CDN.
 * - `public-attachment`: public bucket, persists an attachment entity, block stores the key → CDN.
 * - `private-attachment`: private bucket, persists an attachment entity, block stores the id → presigned.
 *
 * There is deliberately no `private-no-attachment`: private media must be a real
 * attachment so permission can be scoped to it.
 */
export type BlockNoteMediaMode = 'public-no-attachment' | 'public-attachment' | 'private-attachment';

/**
 * File-panel context. The `-attachment` modes require `tenantId` (for the create
 * mutation and, when private, for presigned reads) and an `onComplete` that
 * persists the parsed attachments with host linkage. `onComplete` receives the
 * already-parsed attachments (with their stable client ids) so the persisted row
 * keeps the same id the block references.
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
