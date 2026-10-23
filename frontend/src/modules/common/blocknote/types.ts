import type { BlockNoteEditor, ExtensionFactoryInstance, HeadingOptions } from '@blocknote/core';
import type { DefaultSuggestionItem } from '@blocknote/core/extensions';
import type { FilePanelProps } from '@blocknote/react';
import type { ReactElement } from 'react';
import type { Attachment } from 'sdk';
import type { UploadTemplateId } from 'shared';
import { mediaBlockTypes } from 'shared/blocknote';
import type { customSchema } from '~/modules/common/blocknote/blocknote-schema';
import type { Member } from '~/modules/memberships/types';

export type CustomBlockNoteEditor = typeof customSchema.BlockNoteEditor;
export type CustomBlock = typeof customSchema.Block;

/** The editor a block spec's code receives: a `CustomBlockNoteEditor` there makes `customSchema` reference itself (TS2502). */
// biome-ignore lint/suspicious/noExplicitAny: schema-agnostic editor type
export type AnyBlockNoteEditor = BlockNoteEditor<any, any, any>;

export type CustomBlockTypes = CustomBlock['type'] | 'emoji';
export type CustomBlockMediaTypes = Extract<CustomBlockTypes, 'file' | 'image' | 'audio' | 'video'>;
export type CustomBlockRegularTypes = Exclude<CustomBlockTypes, CustomBlockMediaTypes>;

export const isMediaBlockType = (type: CustomBlockTypes): type is CustomBlockMediaTypes => mediaBlockTypes.has(type);

export const isMediaBlock = (block: CustomBlock): block is Extract<CustomBlock, { type: CustomBlockMediaTypes }> => mediaBlockTypes.has(block.type);

export type SlashItemKeys = DefaultSuggestionItem['key'] | 'notify' | 'checklistItem';

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
  /** The stored blocks, as a JSON string. */
  defaultValue?: string;
  /** Default true; false shows the document read-only. */
  editable?: boolean;
  className?: string;
  /** The heading levels the menus offer, default 1 to 3. */
  headingLevels?: NonNullable<HeadingOptions['defaultLevel']>[];
  /** The block handle, to drag a block or open its move and type menu; default true. */
  sideMenu?: boolean;
  /** The `/` menu, default true. */
  slashMenu?: boolean;
  /** The selection toolbar, on desktop only; default true. */
  formattingToolbar?: boolean;
  /** Keeps an empty paragraph after the last block, default true. */
  trailingBlock?: boolean;
  /** A click on media opens the attachment carousel, default false. */
  clickOpensPreview?: boolean;
  /** Tighter line height (`bn-dense`), default false. */
  dense?: boolean;
  /** The `:` emoji picker, default true. */
  emojis?: boolean;
  excludeBlockTypes?: CustomBlockRegularTypes[];
  excludeMediaBlockTypes?: CustomBlockMediaTypes[];
  /** Labels an empty heading in block 0, the title of a title document (helpers/title-document). */
  titlePlaceholder?: string;
  /** Keeps block 0 first: no drag handle on it, no drop above it, and no move or drop that would displace it. */
  pinTitleBlock?: boolean;
  /** Accessible name of the editing area, such as the label of the form field it fills. */
  ariaLabel?: string;
  extensions?: ExtensionFactoryInstance[];
  /** The members the `@` menu offers; without any there is no `@` menu. */
  members?: Member[];
  onFocus?: () => void;
  /** Called on Escape, after the commit. */
  onEscape?: () => void;
  /** Called on Cmd/Ctrl+Enter, after the commit. */
  onCmdEnter?: () => void;
  /** Runs before a route loads, once the user changed the document since the editor mounted. */
  onBeforeLoad?: (editor: CustomBlockNoteEditor) => void;
} & (
  | { filePanel: (props: FilePanelProps) => ReactElement; baseFilePanelProps?: never }
  | { filePanel?: never; baseFilePanelProps: BaseUppyFilePanelProps }
  | { filePanel?: never; baseFilePanelProps?: never }
);

export interface CustomBlockNoteMenuProps {
  editor: CustomBlockNoteEditor;
  allowedTypes: CustomBlockTypes[];
  headingLevels: NonNullable<CommonBlockNoteProps['headingLevels']>;
}

/** Heading level of a title document's block 0 (helpers/title-document). */
export type TitleLevel = 1 | 2 | 3;
