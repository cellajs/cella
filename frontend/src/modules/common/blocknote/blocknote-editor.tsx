import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';
import '~/modules/common/blocknote/custom-elements/checklist/checklist-styles.css';

import { withCollaboration } from '@blocknote/core/yjs';
import { FilePanelController, GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { type CSSProperties, type MouseEventHandler, type RefObject, useEffect, useEffectEvent, useImperativeHandle, useRef } from 'react';
import { appConfig } from 'shared';
import { type DescriptionBlock, findSummarySource } from 'shared/utils/derive-description-core';
import type { Awareness } from 'y-protocols/awareness';
import type { XmlFragment } from 'yjs';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useLatestCallback } from '~/hooks/use-latest-ref';
import { resolveBlockNoteFileRef } from '~/modules/attachment/helpers/resolve-url';
import { customSchema } from '~/modules/common/blocknote/blocknote-schema';
import { checkedExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';
import { MentionMenu } from '~/modules/common/blocknote/custom-elements/mention/mention-menu';
import { pinnedTitleDropPosition, pinnedTitleExtension } from '~/modules/common/blocknote/custom-elements/pinned-title/pinned-title-extension';
import { FilePanelBridge } from '~/modules/common/blocknote/custom-file-panel/file-panel-bridge';
import { useUploadHost } from '~/modules/common/blocknote/custom-file-panel/upload-host';
import { InlineUppyFilePanel } from '~/modules/common/blocknote/custom-file-panel/uppy-upload-panel';
import { CustomFormattingToolbar } from '~/modules/common/blocknote/custom-formatting-toolbar/formatting-toolbar';
import { CustomSideMenu } from '~/modules/common/blocknote/custom-side-menu/side-menu';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu/slash-menu';
import { findClickedMediaBlockId, getParsedContent } from '~/modules/common/blocknote/helpers/blocknote-helpers';
import { getDictionary } from '~/modules/common/blocknote/helpers/dictionary';
import { openAttachment } from '~/modules/common/blocknote/helpers/open-attachment';
import { shadCNComponents } from '~/modules/common/blocknote/helpers/shad-cn';
import { useEditorKeyboard } from '~/modules/common/blocknote/hooks/use-editor-keyboard';
import { useSmartBlur } from '~/modules/common/blocknote/hooks/use-smart-blur';
import { useUntrustedMediaWarning } from '~/modules/common/blocknote/hooks/use-untrusted-media-warning';
import { useYjsUndoManagerFix } from '~/modules/common/blocknote/hooks/use-yjs-undo-manager-fix';
import { syntaxHighlighter } from '~/modules/common/blocknote/syntax-highlighter';
import {
  type BaseUppyFilePanelProps,
  type CommonBlockNoteProps,
  type CustomBlock,
  type CustomBlockNoteEditor,
  type CustomBlockTypes,
  isMediaBlockType,
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

const blockTypes = Object.keys(customSchema.blockSpecs) as CustomBlockTypes[];

export function BlockNote({
  id,
  className,
  defaultValue = '',
  trailingBlock = true,
  clickOpensPreview = false,
  dense = false,
  headingLevels = [1, 2, 3],
  editable = true,
  autoFocus = false,
  sideMenu = true,
  slashMenu = true,
  formattingToolbar = true,
  emojis = true,
  excludeBlockTypes,
  excludeMediaBlockTypes,
  titlePlaceholder,
  pinTitleBlock = false,
  ariaLabel,
  extensions,
  members,
  filePanel,
  baseFilePanelProps,
  commitOnEveryChange = false,
  collaboration,
  contentApiRef,
  onEditorReady,
  updateData,
  onEscape,
  onCmdEnter,
  onFocus,
  onBeforeLoad,
}: BlockNoteProps) {
  const mode = useUIStore((state) => state.mode);
  const isMobile = useBreakpointBelow('sm');

  const collaborative = !!collaboration;
  const containerRef = useRef<HTMLDivElement>(null);

  const uppyPanelProps = appConfig.has.uploadEnabled ? baseFilePanelProps : undefined;
  // Without an upload path the menus offer no media blocks: BlockNote's own panel only embeds a URL, which the media grammar refuses.
  const canUpload = !!filePanel || !!uppyPanelProps;
  const allowedBlockTypes = blockTypes.filter((type) =>
    isMediaBlockType(type) ? canUpload && !excludeMediaBlockTypes?.includes(type) : !excludeBlockTypes?.includes(type),
  );

  // Parse initial content once at creation time so the undo history starts clean
  const initialContent = collaborative ? undefined : getParsedContent(defaultValue);

  const baseOptions = {
    schema: customSchema,
    initialContent,
    // BlockNoteView's autoFocus prop only stamps a data attribute; focusing on mount is this creation option.
    autofocus: autoFocus,
    trailingBlock,
    dictionary: getDictionary(),
    // Caller extensions come first: BlockNote keeps the first extension per key and drops later duplicates.
    extensions: [...(extensions ?? []), checkedExtension(), syntaxHighlighter, ...(pinTitleBlock ? [pinnedTitleExtension()] : [])],
    ...(pinTitleBlock && { dropCursor: { hooks: { computeDropPosition: pinnedTitleDropPosition } } }),
    // The org context is the fallback for a reference whose attachment is not cached.
    resolveFileUrl: (ref: string) =>
      resolveBlockNoteFileRef(ref, { tenantId: baseFilePanelProps?.tenantId, organizationId: baseFilePanelProps?.organizationId }),
    ...(ariaLabel && { domAttributes: { editor: { 'aria-label': ariaLabel } } }),
  };

  const editor = useCreateBlockNote(collaboration ? withCollaboration({ ...baseOptions, collaboration }) : baseOptions);

  useYjsUndoManagerFix(editor, collaborative);

  const checkUntrustedMedia = useUntrustedMediaWarning({ organizationId: baseFilePanelProps?.organizationId });

  // Escape and blur both commit, so the same document is offered twice; the second call is skipped.
  const lastCommittedRef = useRef<string | null>(null);

  const handleUpdateData = (editor: CustomBlockNoteEditor) => {
    const strBlocks = JSON.stringify(editor.document);
    if (strBlocks === defaultValue || strBlocks === lastCommittedRef.current) return;

    lastCommittedRef.current = strBlocks;
    checkUntrustedMedia(editor.document);
    updateData(strBlocks);
  };

  // A user change since mount: an untouched standalone editor never writes back a stale or merely re-serialized document.
  const touchedRef = useRef(false);
  useEffect(
    () =>
      editor.onChange(() => {
        touchedRef.current = true;
      }, false),
    [editor],
  );

  // An empty collaborative editor may not have synced yet, so it is never written; a touched standalone one writes even when emptied.
  const commitDocument = () => {
    if (collaborative ? editor.isEmpty : !touchedRef.current) return;
    handleUpdateData(editor);
  };

  const handleKeyDown = useEditorKeyboard({ editor, onEscape, onCmdEnter, commit: commitDocument });

  // A host dismissed by an outside press (a sheet) unmounts the editor while it has focus, so no blur fires: the cleanup commits.
  const commit = useLatestCallback(commitDocument);
  useEffect(() => {
    if (!editable || commitOnEveryChange) return;
    return () => {
      if (touchedRef.current) commit();
    };
  }, [editable, commitOnEveryChange, commit]);

  useImperativeHandle(
    contentApiRef,
    () => ({
      getContent: () => JSON.stringify(editor.document),
      focusSummaryEnd: () => {
        editor.focus();
        // The block the derived summary shows, so the cursor stops where the collapsed view ends.
        const { source } = findSummarySource(editor.document as DescriptionBlock[]);
        if (source) editor.setTextCursorPosition(source as CustomBlock, 'end');
      },
      placeCursorAtPoint: (clientX, clientY) => {
        editor.focus();
        const at = editor.prosemirrorView?.posAtCoords({ left: clientX, top: clientY });
        if (at && typeof at.pos === 'number') editor._tiptapEditor.commands.setTextSelection(at.pos);
      },
      toggleChecklist: (checkboxId) => {
        let toggled = false;
        editor.forEachBlock((block) => {
          if (block.type !== 'checklistItem' || block.props.checkboxId !== checkboxId) return true;
          editor.updateBlock(block, { props: { checked: !block.props.checked } });
          toggled = true;
          return false;
        });
        return toggled;
      },
      commit,
    }),
    [editor, commit],
  );

  // It runs after the change subscription, so an edit the parent makes on ready (a queued checklist toggle) counts as a user change.
  const notifyEditorReady = useEffectEvent(() => onEditorReady?.());
  useEffect(() => {
    notifyEditorReady();
  }, [editor]);

  const notifyBeforeLoad = useEffectEvent(() => {
    if (touchedRef.current) onBeforeLoad?.(editor);
  });
  const hasOnBeforeLoad = !!onBeforeLoad;

  const handleBlur = useSmartBlur({
    editor,
    containerRef,
    onBlur: () => {
      if (!commitOnEveryChange) commitDocument();
    },
  });

  const handleClick: MouseEventHandler = (event) => {
    if (!clickOpensPreview) return;

    // While editing only a direct hit on the media element opens the carousel; read-only also opens wrapped file blocks.
    const blockId = findClickedMediaBlockId(event.target, { includeWrapped: !editable });
    if (!blockId) return;

    event.preventDefault();
    openAttachment(editor, blockId, containerRef);
  };

  useEffect(() => {
    if (!hasOnBeforeLoad || !editable) return;
    return getRouter().subscribe('onBeforeLoad', () => notifyBeforeLoad());
  }, [hasOnBeforeLoad, editable]);

  return (
    <BlockNoteView
      id={id}
      theme={mode}
      editor={editor}
      editable={editable}
      autoFocus={autoFocus}
      ref={containerRef}
      className={cn(dense && 'bn-dense', titlePlaceholder && 'bn-title-placeholder', className)}
      // The block-0 title placeholder rides a CSS var: BlockNote's own placeholders are per block type (styles.css)
      {...(titlePlaceholder && { style: { '--bn-title-placeholder': JSON.stringify(titlePlaceholder) } as CSSProperties })}
      shadCNComponents={shadCNComponents}
      sideMenu={false}
      slashMenu={false}
      formattingToolbar={false}
      emojiPicker={false}
      filePanel={false}
      onFocus={onFocus}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      {...(commitOnEveryChange && { onChange: handleUpdateData })}
    >
      {slashMenu && <CustomSlashMenu editor={editor} allowedTypes={allowedBlockTypes} headingLevels={headingLevels} />}

      {!isMobile && formattingToolbar && <CustomFormattingToolbar />}

      {sideMenu && <CustomSideMenu editor={editor} allowedTypes={allowedBlockTypes} headingLevels={headingLevels} pinTitleBlock={pinTitleBlock} />}

      <MentionMenu members={members} editor={editor} />

      {emojis && <GridSuggestionMenuController triggerCharacter=":" columns={8} minQueryLength={1} />}

      <EditorFilePanel uppyPanelProps={uppyPanelProps} filePanel={filePanel} />
    </BlockNoteView>
  );
}

interface EditorFilePanelProps {
  /** Set while uploads are on: the panel is the Uppy dialog. */
  uppyPanelProps?: BaseUppyFilePanelProps;
  filePanel?: CommonBlockNoteProps['filePanel'];
}

/** The panel a media block opens: the Uppy dialog, a caller's own panel, or none. */
function EditorFilePanel({ uppyPanelProps, filePanel }: EditorFilePanelProps) {
  // Set only when an ancestor hoists the upload dialog outside this (possibly remounting) editor.
  const uploadHost = useUploadHost();

  if (uppyPanelProps) {
    // The host renders the dialog outside this subtree; the bridge only relays panel state to it.
    if (uploadHost) return <FilePanelBridge host={uploadHost} />;
    return <FilePanelController filePanel={({ blockId }) => <InlineUppyFilePanel base={uppyPanelProps} blockId={blockId} />} />;
  }
  if (filePanel) return <FilePanelController filePanel={filePanel} />;
  return null;
}
