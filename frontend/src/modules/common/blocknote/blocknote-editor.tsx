import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';
import '~/modules/common/blocknote/custom-elements/checklist/checklist-styles.css';

import { withCollaboration } from '@blocknote/core/yjs';
import type { FilePanelProps } from '@blocknote/react';
import { FilePanelController, GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { type MouseEventHandler, type RefObject, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { appConfig, type ProductEntityType } from 'shared';
import type { WebsocketProvider } from 'y-websocket';
import type { XmlFragment } from 'yjs';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { checkedExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';
import { Mention } from '~/modules/common/blocknote/custom-elements/mention/mention-menu';
import { FilePanelBridge } from '~/modules/common/blocknote/custom-file-panel/file-panel-bridge';
import { useUploadHost } from '~/modules/common/blocknote/custom-file-panel/upload-host';
import { InlineUppyFilePanel } from '~/modules/common/blocknote/custom-file-panel/uppy-upload-panel';
import { CustomFormattingToolbar } from '~/modules/common/blocknote/custom-formatting-toolbar/formatting-toolbar';
import { CustomSideMenu } from '~/modules/common/blocknote/custom-side-menu/side-menu';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu/slash-menu';
import { findClickedMedia, getParsedContent, walkBlocks } from '~/modules/common/blocknote/helpers/blocknote-helpers';
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
  CustomBlock,
  CustomBlockFileTypes,
  CustomBlockNoteEditor,
  CustomBlockRegularTypes,
  CustomBlockTypes,
} from '~/modules/common/blocknote/types';
import { useUIStore } from '~/modules/ui/ui-store';
import { getRouter } from '~/routes/-router-instance';

/**
 * Bundle for collaborative mode: Yjs connection (provider, fragment, cursor user) + entity identity for SSE
 * suppression while editing. Presence of this bundle switches the editor into collaborative mode;
 * the relay persists session state to the entity row.
 */
export interface CollaborationBundle {
  provider: WebsocketProvider;
  fragment: XmlFragment;
  user: { name: string; color: string };
  entityType: ProductEntityType;
  entityId: string;
}

/** Imperative handle for driving a warm/live editor instance from a parent (collaborative or standalone). */
export interface BlockNoteContentApi {
  /** The live document serialized to the stored blocks string (JSON.stringify(editor.document)). */
  getContent: () => string;
  /** Focus and place the cursor at the end of the summary block (first non-checklist text block). */
  focusSummaryEnd: () => void;
  /** Focus and place the text cursor at viewport coordinates (relies on layout parity with the static view). */
  placeCursorAtPoint: (clientX: number, clientY: number) => void;
  /** Toggle a checklist item's `checked` prop by its checkboxId. Returns false if not found. */
  toggleChecklist: (checkboxId: string) => boolean;
}

type BlockNoteProps = CommonBlockNoteProps & {
  updateData: (strBlocks: string) => void;
  autoFocus?: boolean;
  /** When true, fire `updateData` on every change (form-binding mode). Default: only on blur/Escape/Cmd+Enter. */
  commitOnEveryChange?: boolean;
  collaboration?: CollaborationBundle;
  /** Exposes the imperative API for a parent that warms/promotes this editor. */
  contentApiRef?: RefObject<BlockNoteContentApi | null>;
  /** Fires once after the editor is created and mounted, flushing any queued warm-editor actions. */
  onEditorReady?: () => void;
};

function BlockNote({
  id,
  className = '',
  defaultValue = '', // stringified blocks
  trailingBlock = true,
  clickOpensPreview = false, // click on media opens preview; while editing, only direct media hits
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
  contentApiRef,
  onEditorReady,
  // Functions
  updateData,
  onEscapeClick,
  onEnterClick, // Trigger on Cmd+Enter
  onFocus,
  onBeforeLoad,
}: BlockNoteProps) {
  const mode = useUIStore((state) => state.mode);
  const isMobile = useBreakpointBelow('sm');
  // Present only when an ancestor hoists the upload dialog outside this (possibly remounting) editor.
  const uploadHost = useUploadHost();

  const collaborative = !!collaboration;
  const blockNoteRef = useRef<HTMLDivElement | null>(null);

  const defaultAllowedBlockTypes = Object.keys(customSchema.blockSpecs) as CustomBlockTypes[];
  const allowedBlockTypes = defaultAllowedBlockTypes.filter(
    (type) =>
      !excludeBlockTypes?.includes(type as CustomBlockRegularTypes) &&
      !excludeFileBlockTypes?.includes(type as CustomBlockFileTypes),
  );

  // Parse initial content once at creation time so the undo history starts clean
  const initialContent = collaborative ? undefined : getParsedContent(defaultValue);

  const baseOptions = {
    schema: customSchema,
    initialContent,
    heading: { levels: headingLevels },
    trailingBlock,
    dictionary: getDictionary(),
    // Caller extensions first: BlockNote keeps the first extension per key and drops later
    // duplicates, so a caller-provided checkedExtension (e.g. persisted: true) must win over the default.
    extensions: [...(extensions ?? []), checkedExtension()],
    resolveFileUrl: createResolveFileUrl({ baseFilePanelProps }),
  };

  const editor = useCreateBlockNote(
    collaboration
      ? withCollaboration({
          ...baseOptions,
          collaboration: {
            fragment: collaboration.fragment,
            user: collaboration.user,
            provider: collaboration.provider,
          },
        })
      : baseOptions,
  );

  // Expose an imperative API so a parent can warm this editor, promote it, place the cursor at a click,
  // and toggle checklist items. Works in collaborative and standalone mode alike.
  useImperativeHandle(
    contentApiRef,
    () => ({
      getContent: () => JSON.stringify(editor.document),
      focusSummaryEnd: () => {
        editor.focus();
        // Match the collapsed summary source (see deriveDescriptionProps): the first non-checklist
        // block with text content, else the first block. Land the cursor at the end of what's shown.
        const doc = editor.document as CustomBlock[];
        const summaryBlock =
          doc.find(
            (b) =>
              b.type !== 'checklistItem' &&
              Array.isArray(b.content) &&
              b.content.some((c) => 'text' in c && !!c.text.trim()),
          ) ?? doc[0];
        if (summaryBlock) editor.setTextCursorPosition(summaryBlock, 'end');
      },
      placeCursorAtPoint: (clientX, clientY) => {
        editor.focus();
        const at = editor.prosemirrorView?.posAtCoords({ left: clientX, top: clientY });
        if (at && typeof at.pos === 'number') editor._tiptapEditor.commands.setTextSelection(at.pos);
      },
      toggleChecklist: (checkboxId) => {
        let found: CustomBlock | null = null;
        walkBlocks(editor.document as CustomBlock[], (block) => {
          if (block.type === 'checklistItem' && (block.props as { checkboxId?: string }).checkboxId === checkboxId) {
            found = block;
            return false;
          }
        });
        if (!found) return false;
        const checked = (found as CustomBlock).props as { checked?: boolean };
        editor.updateBlock(found, { props: { checked: !checked.checked } });
        return true;
      },
    }),
    [editor],
  );

  // Signal readiness once mounted so a parent can flush actions queued before this editor existed.
  useEffect(() => {
    onEditorReady?.();
  }, [onEditorReady]);

  // Re-subscribe Yjs UndoManager after TipTap mount cycles so CMD+Z keeps working.
  useYjsUndoManagerFix(editor, collaborative);

  // Shield Yjs-owned fields from SSE while this editor is active.
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
      return <InlineUppyFilePanel base={baseFilePanelProps} blockId={props.blockId} />;
    },
    [baseFilePanelProps],
  );

  const handleBlur = useSmartBlur({
    editor,
    containerRef: blockNoteRef,
    onBlur: () => {
      // In `commitOnEveryChange` mode, every change is already pushed via onChange.
      // Guarded with `!editor.isEmpty` to avoid writing empty content before Yjs sync.
      if (!commitOnEveryChange && !editor.isEmpty) handleUpdateData(editor);
    },
  });

  const handleClick: MouseEventHandler = (event) => {
    if (!clickOpensPreview) return;

    // While editing, only a direct hit on the media element opens the carousel; file blocks,
    // captions, resize handles and empty gutter keep their normal editing behavior. When read-only,
    // wrapped file blocks without a preview also open.
    const media = findClickedMedia(event.target as HTMLElement, { includeWrapped: !editable });
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
        // A host hoists the dialog out of this subtree; the bridge only relays panel state to it.
        uploadHost ? (
          <FilePanelBridge host={uploadHost} />
        ) : (
          <FilePanelController filePanel={renderUppyFilePanel} />
        )
      ) : filePanel ? (
        <FilePanelController filePanel={filePanel} />
      ) : (
        <FilePanelController />
      )}
    </BlockNoteView>
  );
}

export { BlockNote };
