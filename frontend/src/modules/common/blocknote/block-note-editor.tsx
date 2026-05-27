import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';
import '~/modules/common/blocknote/custom-elements/checklist/checklist-styles.css';

import {
  FilePanelController,
  type FilePanelProps,
  GridSuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { type MouseEventHandler, useCallback, useEffect, useRef } from 'react';
import { appConfig, type ProductEntityType } from 'shared';
import type { WebsocketProvider } from 'y-websocket';
import type { XmlFragment } from 'yjs';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { checkedExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';
import { Mention } from '~/modules/common/blocknote/custom-elements/mention/mention-menu';
import { UppyFilePanel } from '~/modules/common/blocknote/custom-file-panel/uppy-upload-panel';
import { CustomFormattingToolbar } from '~/modules/common/blocknote/custom-formatting-toolbar/formatting-toolbar';
import { CustomSideMenu } from '~/modules/common/blocknote/custom-side-menu/side-menu';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu/slash-menu';
import { getParsedContent } from '~/modules/common/blocknote/helpers/blocknote-helpers';
import { getDictionary } from '~/modules/common/blocknote/helpers/dictionary';
import { openAttachment } from '~/modules/common/blocknote/helpers/open-attachment';
import { createResolveFileUrl } from '~/modules/common/blocknote/helpers/resolve-file-url';
import { shadCNComponents } from '~/modules/common/blocknote/helpers/shad-cn';
import { useEditorKeyboard } from '~/modules/common/blocknote/hooks/use-editor-keyboard';
import { useSmartBlur } from '~/modules/common/blocknote/hooks/use-smart-blur';
import { useUntrustedMediaWarning } from '~/modules/common/blocknote/hooks/use-untrusted-media-warning';
import { useYjsContentSeed } from '~/modules/common/blocknote/hooks/use-yjs-content-seed';
import { useYjsUndoManagerFix } from '~/modules/common/blocknote/hooks/use-yjs-undo-manager-fix';
import type {
  CommonBlockNoteProps,
  CustomBlockFileTypes,
  CustomBlockNoteEditor,
  CustomBlockRegularTypes,
  CustomBlockTypes,
} from '~/modules/common/blocknote/types';
import { useDerivedFieldsSender } from '~/modules/common/blocknote/use-derived-fields-sender';
import { useUIStore } from '~/modules/ui/ui-store';
import router from '~/routes/router';

/** Pre-built collaboration config from the connection manager store. */
interface CollaborationConfig {
  provider: WebsocketProvider;
  fragment: XmlFragment;
  user: { name: string; color: string };
  showCursorLabels?: 'activity' | 'always';
}

type BlockNoteProps =
  | (CommonBlockNoteProps & {
      updateData: (strBlocks: string) => void;
      autoFocus?: boolean;
      /** When true, fire `updateData` on every change (form-binding mode). Default: only on blur/Escape/Cmd+Enter. */
      commitOnEveryChange?: boolean;
      collaboration: CollaborationConfig;
      entityType: ProductEntityType;
      entityId: string;
      /** Callback that sends description update through a React Query mutation (fires lifecycle hooks). */
      sendDerivedUpdate: (entityId: string, description: string) => Promise<void>;
    })
  | (CommonBlockNoteProps & {
      updateData: (strBlocks: string) => void;
      autoFocus?: boolean;
      commitOnEveryChange?: boolean;
      collaboration?: never;
      entityType?: never;
      entityId?: never;
      sendDerivedUpdate?: never;
    });

function BlockNote({
  id,
  className = '',
  defaultValue = '', // stringified blocks
  trailingBlock = true,
  clickOpensPreview = false, // click on FileBlock opens preview when not editable
  dense = false,
  // Editor functional
  headingLevels = [1, 2, 3],
  editable = true,
  autoFocus = false,
  sideMenu = true,
  slashMenu = true,
  formattingToolbar = true,
  emojis = true,
  excludeBlockTypes,
  excludeFileBlockTypes,
  extensions,
  members, // for mentions
  publicFiles,
  filePanel,
  baseFilePanelProps,
  commitOnEveryChange = false,
  // Collaboration
  collaboration,
  entityType: entityTypeProp,
  entityId: entityIdProp,
  sendDerivedUpdate,
  // Functions
  updateData,
  onEscapeClick,
  onEnterClick, // Trigger on Cmd+Enter
  onFocus,
  onBeforeLoad,
}: BlockNoteProps) {
  const mode = useUIStore((state) => state.mode);
  const isMobile = useBreakpointBelow('sm');

  const collaborative = !!collaboration;
  const blockNoteRef = useRef<HTMLDivElement | null>(null);

  const defaultAllowedBlockTypes = Object.keys(customSchema.blockSpecs) as CustomBlockTypes[];
  const allowedBlockTypes = defaultAllowedBlockTypes.filter(
    (type) =>
      !excludeBlockTypes?.includes(type as CustomBlockRegularTypes) &&
      !excludeFileBlockTypes?.includes(type as CustomBlockFileTypes),
  );

  // Parse initial content once at creation time so the undo history starts clean
  // (BlockNote's recommended pattern from https://www.blocknotejs.org/examples/backend/saving-loading)
  // When using collaboration, skip initialContent — the Yjs provider supplies the document state.
  const initialContent = collaborative ? undefined : getParsedContent(defaultValue);

  const editor = useCreateBlockNote({
    schema: customSchema,
    initialContent,
    heading: { levels: headingLevels },
    trailingBlock,
    dictionary: getDictionary(),
    collaboration,

    extensions: [checkedExtension(), ...(extensions ?? [])],
    resolveFileUrl: createResolveFileUrl({ publicFiles, baseFilePanelProps }),
  }) as unknown as CustomBlockNoteEditor;

  // Re-subscribe Yjs UndoManager after TipTap mount cycles so CMD+Z keeps working.
  useYjsUndoManagerFix(editor, collaborative);

  // Send derived fields (summary, checkbox counts, etc.) to backend in collaborative mode.
  // Also manages Yjs editor store registration for SSE suppression — unregister is
  // chained after the flush mutation completes so SSE can't overwrite with stale data.
  const { markContentAsSent } = useDerivedFieldsSender(
    collaborative && entityTypeProp && entityIdProp && sendDerivedUpdate
      ? {
          entityId: entityIdProp,
          entityType: entityTypeProp,
          editor,
          sendUpdate: sendDerivedUpdate,
        }
      : null,
  );

  // Seed Y.Doc with existing content on first sync when document is empty
  useYjsContentSeed({
    editor,
    provider: collaboration?.provider,
    defaultValue,
    markContentAsSent,
  });

  const handleKeyDown = useEditorKeyboard({
    editor,
    onEscapeClick,
    onEnterClick,
    commit: () => handleUpdateData(editor),
  });

  const checkUntrustedMedia = useUntrustedMediaWarning();

  const handleUpdateData = (editor: CustomBlockNoteEditor) => {
    const strBlocks = JSON.stringify(editor.document);
    if (strBlocks === defaultValue || !updateData) return;

    checkUntrustedMedia(editor.document);
    updateData(strBlocks);
  };

  const handleOnBeforeLoad = () => onBeforeLoad?.(editor);

  const renderUppyFilePanel = useCallback(
    (props: FilePanelProps) => {
      if (!baseFilePanelProps) return null;
      return <UppyFilePanel {...baseFilePanelProps} {...props} />;
    },
    [baseFilePanelProps],
  );

  const handleBlur = useSmartBlur({
    editor,
    containerRef: blockNoteRef,
    onBlur: () => {
      // In `commitOnEveryChange` mode, every change is already pushed via onChange,
      // so blur is a no-op. Otherwise we commit pending edits to the cache here.
      // Guarded with `!editor.isEmpty` to avoid writing empty content before Yjs sync.
      if (!commitOnEveryChange && !editor.isEmpty) handleUpdateData(editor);
    },
  });

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
      autoFocus={autoFocus}
      ref={blockNoteRef}
      className={`${dense ? 'bn-dense' : ''} ${className}`}
      data-color-scheme={mode}
      shadCNComponents={shadCNComponents}
      sideMenu={false}
      slashMenu={!slashMenu}
      formattingToolbar={false}
      emojiPicker={!emojis}
      filePanel={false}
      onFocus={onFocus}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      {...(commitOnEveryChange && { onChange: handleUpdateData })}
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

      {baseFilePanelProps && appConfig.has.uploadEnabled ? (
        <FilePanelController filePanel={renderUppyFilePanel} />
      ) : filePanel ? (
        <FilePanelController filePanel={filePanel} />
      ) : (
        <FilePanelController />
      )}
    </BlockNoteView>
  );
}

export default BlockNote;
