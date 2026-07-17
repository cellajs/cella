import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';
import '~/modules/common/blocknote/custom-elements/checklist/checklist-styles.css';

import type { FilePanelProps } from '@blocknote/react';
import { FilePanelController, GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
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
import { findClickedMedia, getParsedContent } from '~/modules/common/blocknote/helpers/blocknote-helpers';
import { getDictionary } from '~/modules/common/blocknote/helpers/dictionary';
import { openAttachment } from '~/modules/common/blocknote/helpers/open-attachment';
import { createResolveFileUrl } from '~/modules/common/blocknote/helpers/resolve-file-url';
import { shadCNComponents } from '~/modules/common/blocknote/helpers/shad-cn';
import { useEditorKeyboard } from '~/modules/common/blocknote/hooks/use-editor-keyboard';
import { useSmartBlur } from '~/modules/common/blocknote/hooks/use-smart-blur';
import { useUntrustedMediaWarning } from '~/modules/common/blocknote/hooks/use-untrusted-media-warning';
import { useYjsSseSuppression } from '~/modules/common/blocknote/hooks/use-yjs-sse-suppression';
import { useYjsUndoManagerFix } from '~/modules/common/blocknote/hooks/use-yjs-undo-manager-fix';
import type {
  CommonBlockNoteProps,
  CustomBlockFileTypes,
  CustomBlockNoteEditor,
  CustomBlockRegularTypes,
  CustomBlockTypes,
} from '~/modules/common/blocknote/types';
import { useUIStore } from '~/modules/ui/ui-store';
import { getRouter } from '~/routes/_router-instance';

/**
 * Bundle for collaborative mode: Yjs wiring (provider, fragment, cursor user) + entity identity for SSE
 * suppression while editing. Presence of this bundle switches the editor into collaborative mode;
 * persistence is relay-side (the relay materializes sessions into the entity row).
 */
export interface CollaborationBundle {
  provider: WebsocketProvider;
  fragment: XmlFragment;
  user: { name: string; color: string };
  entityType: ProductEntityType;
  entityId: string;
}

type BlockNoteProps = CommonBlockNoteProps & {
  updateData: (strBlocks: string) => void;
  autoFocus?: boolean;
  /** When true, fire `updateData` on every change (form-binding mode). Default: only on blur/Escape/Cmd+Enter. */
  commitOnEveryChange?: boolean;
  collaboration?: CollaborationBundle;
};

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
  filePanel,
  baseFilePanelProps,
  commitOnEveryChange = false,
  // Collaboration
  collaboration,
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
  // In collaboration mode, the Yjs provider supplies the document state.
  const initialContent = collaborative ? undefined : getParsedContent(defaultValue);

  const editor = useCreateBlockNote({
    schema: customSchema,
    initialContent,
    heading: { levels: headingLevels },
    trailingBlock,
    dictionary: getDictionary(),
    // Only the Yjs wiring goes to the editor; the entity identity in the bundle
    // is consumed by the SSE suppression hook below.
    collaboration: collaboration
      ? { provider: collaboration.provider, fragment: collaboration.fragment, user: collaboration.user }
      : undefined,

    extensions: [checkedExtension(), ...(extensions ?? [])],
    resolveFileUrl: createResolveFileUrl({ baseFilePanelProps }),
  });

  // Re-subscribe Yjs UndoManager after TipTap mount cycles so CMD+Z keeps working.
  useYjsUndoManagerFix(editor, collaborative);

  // Shield Yjs-owned fields from SSE while this editor is active. The relay owns
  // persistence (seeding + materialization), so no client sends description updates.
  useYjsSseSuppression(
    collaboration ? { entityType: collaboration.entityType, entityId: collaboration.entityId } : null,
  );

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

    const media = findClickedMedia(event.target as HTMLElement, { includeWrapped: true });
    if (!media) return;

    event.preventDefault();
    // The clicked media's src starts the carousel at that item
    openAttachment(editor, blockNoteRef, media.src);
  };

  useEffect(() => {
    if (!onBeforeLoad || !editable) return;
    const unsubscribe = getRouter().subscribe('onBeforeLoad', handleOnBeforeLoad);
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

export { BlockNote };
