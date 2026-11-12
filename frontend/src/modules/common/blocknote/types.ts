import type { BlockNoteEditor, ExtensionFactoryInstance, HeadingOptions } from '@blocknote/core';
import type { DefaultSuggestionItem } from '@blocknote/core/extensions';
import type { Attachment } from 'sdk';
import type { UploadTemplateId } from 'shared';
import { type MediaBlockType, mediaBlockTypes } from 'shared/blocknote';
import type { customSchema } from '~/modules/common/blocknote/blocknote-schema';
import type { Member } from '~/modules/memberships/types';

export type CustomBlockNoteEditor = typeof customSchema.BlockNoteEditor;
export type CustomBlock = typeof customSchema.Block;

/** The editor a block spec's code receives: a `CustomBlockNoteEditor` there makes `customSchema` reference itself (TS2502). */
// biome-ignore lint/suspicious/noExplicitAny: schema-agnostic editor type
export type AnyBlockNoteEditor = BlockNoteEditor<any, any, any>;

export type CustomBlockTypes = CustomBlock['type'];
export type CustomBlockMediaTypes = Extract<CustomBlockTypes, MediaBlockType>;

export const isMediaBlockType = (type: CustomBlockTypes): type is CustomBlockMediaTypes => mediaBlockTypes.has(type);

export const isMediaBlock = (block: CustomBlock): block is Extract<CustomBlock, { type: CustomBlockMediaTypes }> => mediaBlockTypes.has(block.type);

export type SlashItemKeys = DefaultSuggestionItem['key'] | 'notify' | 'checklistItem';

/** How an upload is referenced: by attachment id, or by cloud key when its upload template stores publicly (the template decides). */
export type BlockNoteMediaMode = 'public-no-attachment' | 'public-attachment' | 'private-attachment';

/** An attachment mode makes a row per file, which `persist` creates; `public-no-attachment` uploads through its own public template and the block keeps the stored key. */
export type MediaUpload =
  | { mediaMode: 'public-no-attachment'; templateId: UploadTemplateId }
  | {
      mediaMode: 'public-attachment' | 'private-attachment';
      /** Creates the rows of the uploaded files. The editor awaits it before a block names a row. */
      persist: (attachments: Attachment[]) => void | Promise<void>;
    };

/** Where a document's files live. */
export type EditorMedia = {
  /** Storage prefix of the document's media: its organization id, or `systemUploadPrefix` for a system document. */
  organizationId: string;
  /** Resolves private files; an attachment upload mode needs it. */
  tenantId?: string;
  /** With it the editor adds files: the upload dialog, paste and drop. Without it the menus offer no media blocks. */
  upload?: MediaUpload;
};

export type CommonBlockNoteProps = {
  id: string;
  /** The stored blocks, as a JSON string. */
  defaultValue?: string;
  /** Default true; false shows the document read-only. */
  editable?: boolean;
  className?: string;
  /** The heading levels the editor allows, default 1 to 3: the menus offer them, and a heading made at another level moves to the nearest. */
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
  excludeBlockTypes?: Exclude<CustomBlockTypes, CustomBlockMediaTypes>[];
  excludeMediaBlockTypes?: CustomBlockMediaTypes[];
  /** Labels an empty heading in block 0, the title of a title document (helpers/title-document). */
  titlePlaceholder?: string;
  /** Accessible name of the editing area, such as the label of the form field it fills. */
  ariaLabel?: string;
  extensions?: ExtensionFactoryInstance[];
  /** The members the `@` menu offers; without any there is no `@` menu. */
  members?: Member[];
  media?: EditorMedia;
  /**
   * Pasted text that would add more lines than this becomes a file in the document, counted at the editor's current
   * width; structured data (JSON) always does. Only with an attachment upload mode. Default `pastedTextMaxLines`.
   */
  pastedTextMaxLines?: number;
  onFocus?: () => void;
  /** Called on Escape, after the commit. */
  onEscape?: () => void;
  /** Called on Cmd/Ctrl+Enter, after the commit. */
  onCmdEnter?: () => void;
  /** Runs before a route loads, once the user changed the document since the editor mounted. */
  onBeforeLoad?: (editor: CustomBlockNoteEditor) => void;
};

export interface CustomBlockNoteMenuProps {
  editor: CustomBlockNoteEditor;
  allowedTypes: CustomBlockTypes[];
  headingLevels: NonNullable<CommonBlockNoteProps['headingLevels']>;
}

/** Heading level of a title document's block 0 (helpers/title-document). */
export type TitleLevel = 1 | 2 | 3;
