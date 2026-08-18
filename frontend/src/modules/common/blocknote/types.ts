import type { ExtensionFactoryInstance, HeadingOptions } from '@blocknote/core';
import type { DefaultSuggestionItem } from '@blocknote/core/extensions';
import type { FilePanelProps } from '@blocknote/react';
import type React from 'react';
import type { Attachment } from 'sdk';
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

/** Whether BlockNote stores a public bucket key or a private attachment id; private media needs the id for permission-scoped access. */
export type BlockNoteMediaMode = 'public-no-attachment' | 'public-attachment' | 'private-attachment';

/** Attachment modes require a tenantId for persistence and private reads. */
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
  /** Forced-title mode: block 0 is a heading acting as document title. `true` pins level 1; `{ level }` sets it lower. */
  forcedTitle?: boolean | { level: TitleLevel };
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
  /** Forced-title mode: menus hide headings at or above this level for body blocks and skip block 0 entirely. */
  titleLevel?: TitleLevel;
};

/** Heading level a forced-title editor pins block 0 to. */
export type TitleLevel = 1 | 2 | 3;
