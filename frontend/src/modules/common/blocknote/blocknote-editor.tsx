import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';
import '~/modules/common/blocknote/custom-elements/checklist/checklist-styles.css';

import { syntaxHighlighter } from '@blocknote/code-block';
import { withCollaboration } from '@blocknote/core/yjs';
import type { FilePanelProps } from '@blocknote/react';
import { FilePanelController, GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { type MouseEventHandler, type RefObject, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { appConfig } from 'shared';
import { mediaBlockTypes } from 'shared/blocknote';
import { type DescriptionBlock, findSummarySource } from 'shared/utils/derive-description-core';
import type { Awareness } from 'y-protocols/awareness';
import type { XmlFragment } from 'yjs';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useLatestRef } from '~/hooks/use-latest-ref';
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
import { cn } from '~/utils/cn';

/** Yjs connection and cursor identity; passing this bundle switches the editor into collaborative mode. */
export interface CollaborationBundle {
  /** BlockNote reads only the Awareness of a provider: the connection's own, which outlives a switch of transport. */
  provider: { awareness: Awareness };
  fragment: XmlFragment;
  user: { name: string; color: string };
}

/** Imperative handle for driving a warm/live editor instance from a parent (collaborative or standalone). */
export interface BlockNoteContentApi {
  /** The live document serialized to the stored blocks string (JSON.stringify(editor.document)). */
  getContent: () => string;
  /** Focus and place the cursor at the end of the summary block: the first non-checklist text block. */
  focusSummaryEnd: () => void;
  /** Place the text cursor at viewport coordinates; relies on layout parity with the static view. */
  placeCursorAtPoint: (clientX: number, clientY: number) => void;
  /** Toggle a checklist item's `checked` prop by its checkboxId. Returns false if not found. */
  toggleChecklist: (checkboxId: string) => boolean;
  /** Commit the document as blur does: a cache patch while collaborative, a write for a standalone editor once changed. */
  commit: () => void;
}

type BlockNoteProps = CommonBlockNoteProps & {
  updateData: (strBlocks: string) => void;
  autoFocus?: boolean;
  /** When true, fire `updateData` on every change (form-binding mode). Default: only on blur/Escape/Cmd+Enter. */
  commitOnEveryChange?: boolean;
  collaboration?: CollaborationBundle;
  contentApiRef?: RefObject<BlockNoteContentApi | null>;
  /** Fires once per editor instance, after it is created and mounted. */
  onEditorReady?: () => void;
};

function BlockNote({
  id,
  className = '',
  defaultValue = '', // stringified blocks
  trailingBlock = true,
  clickOpensPreview = false,
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
  titlePlaceholder,
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
  // Set only when an ancestor hoists the upload dialog outside this (possibly remounting) editor.
  const uploadHost = useUploadHost();

  const collaborative = !!collaboration;
  const blockNoteRef = useRef<HTMLDivElement | null>(null);

  // Without an upload path the menus offer no media blocks: BlockNote's own panel can only embed a URL, which the media
  // grammar refuses. Stored media blocks still render.
  const canUpload = !!filePanel || (!!baseFilePanelProps && appConfig.has.uploadEnabled);
  const defaultAllowedBlockTypes = Object.keys(customSchema.blockSpecs) as CustomBlockTypes[];
  const allowedBlockTypes = defaultAllowedBlockTypes.filter((type) =>
    mediaBlockTypes.has(type)
      ? canUpload && !excludeFileBlockTypes?.includes(type as CustomBlockFileTypes)
      : !excludeBlockTypes?.includes(type as CustomBlockRegularTypes),
  );

  // Parse initial content once at creation time so the undo history starts clean
  const initialContent = collaborative ? undefined : getParsedContent(defaultValue);

  const baseOptions = {
    schema: customSchema,
    initialContent,
    // BlockNoteView's autoFocus prop only stamps a data attribute; focusing on mount is this creation option.
    autofocus: autoFocus,
    heading: { levels: headingLevels },
    trailingBlock,
    dictionary: getDictionary(),
    // Caller extensions come first: BlockNote keeps the first extension per key and drops later duplicates.
    extensions: [...(extensions ?? []), checkedExtension(), syntaxHighlighter],
    resolveFileUrl: createResolveFileUrl({ baseFilePanelProps }),
  };

  const editor = useCreateBlockNote(
    collaboration
      ? withCollaboration({
          ...baseOptions,
          collaboration: { fragment: collaboration.fragment, user: collaboration.user, provider: collaboration.provider },
        })
      : baseOptions,
  );

  useYjsUndoManagerFix(editor, collaborative);

  const checkUntrustedMedia = useUntrustedMediaWarning({ organizationId: baseFilePanelProps?.organizationId });

  // Escape and blur both commit, so the same document is offered twice; the second call is skipped.
  const lastCommittedRef = useRef<string | null>(null);

  const handleUpdateData = (editor: CustomBlockNoteEditor) => {
    const strBlocks = JSON.stringify(editor.document);
    if (strBlocks === defaultValue || strBlocks === lastCommittedRef.current || !updateData) return;

    lastCommittedRef.current = strBlocks;
    checkUntrustedMedia(editor.document);
    updateData(strBlocks);
  };

  // A user change since mount: a standalone editor commits only after one, so an untouched editor never writes back a
  // document the description has moved past since, or one it only serializes differently.
  const touchedRef = useRef(false);
  useEffect(
    () =>
      editor.onChange(() => {
        touchedRef.current = true;
      }, false),
    [editor],
  );

  // Collaborative: an empty editor may mean Yjs has not synced yet, so it is never written.
  // Standalone: an emptied document is a real edit, and an untouched one is none; handleUpdateData skips unchanged content.
  const commitDocument = () => {
    if (collaborative ? editor.isEmpty : !touchedRef.current) return;
    handleUpdateData(editor);
  };

  const handleKeyDown = useEditorKeyboard({ editor, onEscapeClick, onEnterClick, commit: commitDocument });

  // A host dismissed by an outside press (a sheet) unmounts the editor while it still has focus, so
  // no blur fires; the cleanup commits what blur would have, after a user change: a REST write
  // standalone, a cache patch collaborative, whose write the relay owns. lastCommittedRef keeps a
  // blur that did fire from committing twice.
  const commitDocumentRef = useRef(commitDocument);
  commitDocumentRef.current = commitDocument;
  useEffect(() => {
    if (!editable || commitOnEveryChange) return;
    return () => {
      if (touchedRef.current) commitDocumentRef.current();
    };
  }, [editable, commitOnEveryChange]);

  useImperativeHandle(
    contentApiRef,
    () => ({
      getContent: () => JSON.stringify(editor.document),
      focusSummaryEnd: () => {
        editor.focus();
        // The block the derived summary shows, so the cursor lands where the collapsed view ends.
        const { source } = findSummarySource(editor.document as DescriptionBlock[]);
        if (source) editor.setTextCursorPosition(source as CustomBlock, 'end');
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
      commit: () => commitDocumentRef.current(),
    }),
    [editor],
  );

  // Once per editor instance: a parent passing a new callback has no new editor. It runs after the change
  // subscription, so an edit the parent makes on ready (a queued checklist toggle) counts as a user change.
  const onEditorReadyRef = useLatestRef(onEditorReady);
  useEffect(() => {
    onEditorReadyRef.current?.();
  }, [editor, onEditorReadyRef]);

  // The latest callback, so a navigation compares with the props current then.
  const onBeforeLoadRef = useLatestRef(onBeforeLoad);
  const hasOnBeforeLoad = !!onBeforeLoad;

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
      if (!commitOnEveryChange) commitDocument();
    },
  });

  const handleClick: MouseEventHandler = (event) => {
    if (!clickOpensPreview) return;

    // While editing only a direct hit on the media element opens the carousel; read-only also opens wrapped file blocks.
    const media = findClickedMedia(event.target as HTMLElement, { includeWrapped: !editable });
    if (!media) return;

    event.preventDefault();
    openAttachment(editor, blockNoteRef, media.src);
  };

  useEffect(() => {
    if (!hasOnBeforeLoad || !editable) return;
    return getRouter().subscribe('onBeforeLoad', () => {
      if (touchedRef.current) onBeforeLoadRef.current?.(editor);
    });
  }, [hasOnBeforeLoad, editable, editor, onBeforeLoadRef]);

  return (
    <BlockNoteView
      id={id}
      theme={mode}
      editor={editor}
      editable={editable}
      autoFocus={autoFocus}
      ref={blockNoteRef}
      className={cn(dense && 'bn-dense', titlePlaceholder && 'bn-title-placeholder', className)}
      // The block-0 title placeholder rides a CSS var: BlockNote's own placeholders are per block type (styles.css)
      {...(titlePlaceholder && { style: { '--bn-title-placeholder': JSON.stringify(titlePlaceholder) } as React.CSSProperties })}
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

      {!isMobile && formattingToolbar && <CustomFormattingToolbar headingLevels={headingLevels} />}

      {sideMenu && <CustomSideMenu editor={editor} allowedTypes={allowedBlockTypes} headingLevels={headingLevels} />}

      {/* To avoid rendering "0" */}
      {members?.length ? <Mention members={members} editor={editor} /> : null}

      {emojis && <GridSuggestionMenuController triggerCharacter={':'} columns={8} minQueryLength={1} />}

      {baseFilePanelProps && appConfig.has.uploadEnabled ? (
        // The host renders the dialog outside this subtree; the bridge only relays panel state to it.
        uploadHost ? (
          <FilePanelBridge host={uploadHost} />
        ) : (
          <FilePanelController filePanel={renderUppyFilePanel} />
        )
      ) : filePanel ? (
        <FilePanelController filePanel={filePanel} />
      ) : null}
    </BlockNoteView>
  );
}

export { BlockNote };
