import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';

import {
  FilePanelExtension,
  FormattingToolbarExtension,
  SideMenuExtension,
  SuggestionMenu,
} from '@blocknote/core/extensions';
import { GridSuggestionMenuController, useCreateBlockNote, useExtension, useExtensionState } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { type FocusEventHandler, type KeyboardEventHandler, type MouseEventHandler, useEffect, useRef } from 'react';
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { getFileUrl } from '~/modules/attachment/helpers';
import { findAttachmentInListCache } from '~/modules/attachment/query';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { Mention } from '~/modules/common/blocknote/custom-elements/mention';
import { CustomFilePanel } from '~/modules/common/blocknote/custom-file-panel';
import { CustomFormattingToolbar } from '~/modules/common/blocknote/custom-formatting-toolbar';
import { CustomSideMenu } from '~/modules/common/blocknote/custom-side-menu';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu';
import { compareIsContentSame, getParsedContent, getRandomColor } from '~/modules/common/blocknote/helpers';
import { getDictionary } from '~/modules/common/blocknote/helpers/dictionary';
import { openAttachment } from '~/modules/common/blocknote/helpers/open-attachment';
import { shadCNComponents } from '~/modules/common/blocknote/helpers/shad-cn';
import type {
  CommonBlockNoteProps,
  CustomBlockFileTypes,
  CustomBlockNoteEditor,
  CustomBlockRegularTypes,
  CustomBlockTypes,
} from '~/modules/common/blocknote/types';
import router from '~/routes/router';
import { useUIStore } from '~/store/ui';

// IDE-like wrapping characters (constant, no need to recreate per keystroke)
const wrappingChars: Record<string, string> = {
  '[': ']',
  '{': '}',
  '(': ')',
  '`': '`',
  '"': '"',
  "'": "'",
};

type BlockNoteProps =
  | (CommonBlockNoteProps & {
      type: 'edit' | 'create';
      updateData: (strBlocks: string) => void;
      autoFocus?: boolean;
      collaborative: true;
      user: {
        id?: string;
        name: string;
        color?: string;
      };
    })
  | (CommonBlockNoteProps & {
      type: 'edit' | 'create';
      updateData: (strBlocks: string) => void;
      autoFocus?: boolean;
      collaborative?: false | undefined;
      user?: never;
    })
  | (CommonBlockNoteProps & {
      type: 'preview';
      editable?: never;
      updateData?: never;
      autoFocus?: never;
      onEscapeClick?: never;
      onEnterClick?: never;
      onBeforeLoad?: never;
      filePanel?: never;
      baseFilePanelProps?: never;
      collaborative?: never;
      user?: never;
    });

function BlockNote({
  id,
  type,
  className = '',
  defaultValue = '', // stringified blocks
  trailingBlock = true,
  clickOpensPreview = false, // click on FileBlock opens preview (in case, type is 'preview' or not editable)
  dense = false,
  // Editor functional
  headingLevels = [1, 2, 3],
  editable = type !== 'preview',
  autoFocus = false,
  sideMenu = true,
  slashMenu = true,
  formattingToolbar = true,
  emojis = true,
  excludeBlockTypes = [], // default types
  excludeFileBlockTypes = [], // default filetypes
  members, // for mentions
  publicFiles,
  filePanel,
  baseFilePanelProps,
  // Collaboration
  collaborative = false,
  user,
  // Functions
  updateData,
  onEscapeClick,
  onEnterClick, // Trigger on Cmd+Enter
  onFocus,
  onBeforeLoad,
}: BlockNoteProps) {
  const mode = useUIStore((state) => state.mode);
  const isMobile = useBreakpoints('max', 'sm');

  const blockNoteRef = useRef<HTMLDivElement | null>(null);

  const defaultAllowedBlockTypes = Object.keys(customSchema.blockSpecs) as CustomBlockTypes[];
  const allowedBlockTypes = defaultAllowedBlockTypes.filter(
    (type) =>
      !excludeBlockTypes.includes(type as CustomBlockRegularTypes) &&
      !excludeFileBlockTypes.includes(type as CustomBlockFileTypes),
  );

  const collaborationConfig = collaborative
    ? (() => {
        // Share a single Y.Doc between provider and fragment so collaboration actually works
        const yDoc = new Y.Doc();
        return {
          // The Yjs Provider responsible for transporting updates:
          provider: new WebrtcProvider(id, yDoc),
          // Where to store BlockNote data in the Y.Doc:
          fragment: yDoc.getXmlFragment('document-store'),
          // Information (name and color) for this user:
          user: {
            name: user?.name || 'Anonymous User',
            color: user?.color || getRandomColor(),
          },
          // When to show user labels on the collaboration cursor. Set by default to
          // "activity" (show when the cursor moves), but can also be set to "always".
          showCursorLabels: 'activity' as const,
        };
      })()
    : undefined;

  const editor = useCreateBlockNote({
    schema: customSchema,
    heading: { levels: headingLevels },
    trailingBlock,
    dictionary: getDictionary(),
    ...(autoFocus && editable ? { autofocus: 'end' as const } : {}),
    collaboration: collaborationConfig,
    // Offline-first file URL resolution:
    // 1. If key looks like an attachment ID (nanoid format), check local blob storage
    // 2. Fall back to presigned URL from cloud (backend infers public/private from key pattern)
    resolveFileUrl: async (key) => {
      if (!key.length) return '';

      // Check if this looks like an attachment ID (for offline-first lookup)
      // Attachment IDs are nanoid format, cloud keys contain slashes
      const isAttachmentId = !key.includes('/');

      if (isAttachmentId) {
        // Try local blob with variant fallback (converted → original → raw)
        const localResult = await attachmentStorage.createBlobUrlWithVariant(key, 'converted', true);
        if (localResult) {
          return localResult.url;
        }
      }

      // Fall back to cloud URL
      // Use publicFiles prop if set, otherwise default to private
      const isPublic = publicFiles ?? baseFilePanelProps?.isPublic ?? false;

      // Get organizationId and tenantId from cache (if key is attachment ID) or from props
      const cachedAttachment = isAttachmentId ? findAttachmentInListCache(key) : null;
      const tenantId = cachedAttachment?.tenantId ?? baseFilePanelProps?.tenantId;
      const organizationId = cachedAttachment?.organizationId ?? baseFilePanelProps?.organizationId;

      if (!tenantId || !organizationId) {
        console.error(
          '[BlockNote] Cannot resolve private file URL: no tenantId/organizationId available for key:',
          key,
        );
        return '';
      }

      return getFileUrl(key, isPublic, tenantId, organizationId);
    },
  });

  const handleKeyDown: KeyboardEventHandler = (event) => {
    const { metaKey, ctrlKey, key } = event;
    const isEscape = key === 'Escape';
    const isCmdEnter = key === 'Enter' && (metaKey || ctrlKey);

    // Handle character-based wrapping
    if (key in wrappingChars) {
      const selection = editor.getSelection();

      const singleBlockSelected =
        selection &&
        selection.blocks.length === 1 &&
        Array.isArray(selection.blocks[0].content) &&
        selection.blocks[0].content.length > 0;

      if (singleBlockSelected) {
        event.preventDefault();

        const [currentBlock] = selection.blocks;
        const selectedText = editor.getSelectedText();

        editor.updateBlock(currentBlock, {
          content: `${key}${selectedText}${wrappingChars[key]}`,
        });

        return;
      }
    }

    // Skip everything else if it's not special command
    if (!isEscape && !isCmdEnter) return;

    event.preventDefault();

    // Escape handling
    if (isEscape) {
      onEscapeClick?.();
      return;
    }

    // Cmd/Ctrl + Enter
    event.stopPropagation();
    onEnterClick?.();

    if (!editor.isEmpty) handleUpdateData(editor);
  };

  const handleUpdateData = (editor: CustomBlockNoteEditor) => {
    const strBlocks = JSON.stringify(editor.document);
    if (compareIsContentSame(strBlocks, defaultValue) || !updateData) return;

    updateData(strBlocks);
  };

  const handleOnBeforeLoad = () => onBeforeLoad?.(editor);

  const sideMenuExt = useExtensionState(SideMenuExtension, { editor });
  const suggestionMenuExt = useExtension(SuggestionMenu, { editor });
  const formattingToolbarShown = useExtensionState(FormattingToolbarExtension, {
    editor,
  });
  const filePanelShown = !!useExtensionState(FilePanelExtension, { editor });

  const handleBlur: FocusEventHandler = (event) => {
    // if user in Side Menu does not update
    if (sideMenuExt?.show) return;

    // if user in Formatting Toolbar does not update
    if (formattingToolbarShown) return;

    // if user in Slash Menu does not update
    if (suggestionMenuExt.shown()) return;

    // if user in file panel does not update
    if (filePanelShown) return;

    const nextFocused = event.relatedTarget;
    // Check if the next focused element is still inside the editor
    if (nextFocused && blockNoteRef.current && blockNoteRef.current.contains(nextFocused)) return;

    if (type === 'edit') handleUpdateData(editor);
  };

  const handleClick: MouseEventHandler = (event) => {
    if (!clickOpensPreview || editable) return;

    const target = event.target as HTMLElement;

    // Check if click is on or inside a media element
    const mediaElement = target.closest('img, video, audio') || target.querySelector('img, video, audio');
    const insideFileBlock = !!target.closest('.bn-file-block-content-wrapper');

    if (!mediaElement && !insideFileBlock) return;

    event.preventDefault();

    // Get the src of the clicked media to start carousel at that item
    const clickedSrc = (mediaElement as HTMLMediaElement)?.src;
    openAttachment(editor, blockNoteRef, clickedSrc);
  };

  const passedContent = getParsedContent(defaultValue);

  useEffect(() => {
    const currentContent = JSON.stringify(editor.document);
    if (compareIsContentSame(currentContent, defaultValue)) return;

    if (passedContent === undefined) editor.removeBlocks(editor.document);
    else editor.replaceBlocks(editor.document, passedContent);
  }, [passedContent]);

  useEffect(() => {
    if (!onBeforeLoad || !editable) return;
    const unsubscribe = router.subscribe('onBeforeLoad', handleOnBeforeLoad);
    return () => unsubscribe();
  }, []);

  return (
    <BlockNoteView
      id={id}
      theme={mode}
      editor={editor}
      editable={editable}
      ref={blockNoteRef}
      className={`${dense ? 'bn-dense' : ''} ${className}`}
      data-color-scheme={mode}
      shadCNComponents={shadCNComponents}
      sideMenu={false}
      slashMenu={!slashMenu}
      formattingToolbar={!formattingToolbar}
      emojiPicker={!emojis}
      filePanel={false} // Because in CustomFilePanel renders default UI
      onFocus={onFocus}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      {...(type === 'create' && { onChange: handleUpdateData })}
    >
      {slashMenu && <CustomSlashMenu editor={editor} allowedTypes={allowedBlockTypes} headingLevels={headingLevels} />}

      {/* Hide formatting toolbar on mobile */}
      {!isMobile && formattingToolbar && <CustomFormattingToolbar headingLevels={headingLevels} />}

      {/* By default hides on mobile */}
      {sideMenu && <CustomSideMenu editor={editor} allowedTypes={allowedBlockTypes} headingLevels={headingLevels} />}

      {/* To avoid rendering "0" */}
      {members?.length ? <Mention members={members} editor={editor} /> : null}

      {/* Changes the Emoji Picker to only have 8 columns & min length of 0. */}
      {emojis && <GridSuggestionMenuController triggerCharacter={':'} columns={8} minQueryLength={1} />}

      <CustomFilePanel filePanel={filePanel} baseFilePanelProps={baseFilePanelProps} />
    </BlockNoteView>
  );
}

export default BlockNote;
