import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';
import '~/modules/common/blocknote/custom-elements/checklist/checklist-styles.css';

import { syntaxHighlighter } from '@blocknote/code-block';
import { withCollaboration } from '@blocknote/core/yjs';
import type { FilePanelProps } from '@blocknote/react';
import { FilePanelController, GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { type MouseEventHandler, type RefObject, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type ProductEntityType } from 'shared';
import type { WebsocketProvider } from 'y-websocket';
import type { XmlFragment } from 'yjs';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { checkedExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';
import { forcedTitleExtension } from '~/modules/common/blocknote/custom-elements/forced-title/forced-title-extension';
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

/** Yjs connection plus entity identity for SSE suppression; passing this bundle switches the editor into collaborative mode. */
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
  /** Focus and place the cursor at the end of the summary block: the first non-checklist text block. */
  focusSummaryEnd: () => void;
  /** Place the text cursor at viewport coordinates; relies on layout parity with the static view. */
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
  contentApiRef?: RefObject<BlockNoteContentApi | null>;
  /** Fires once after the editor is created and mounted. */
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
  forcedTitle = false,
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
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);
  const isMobile = useBreakpointBelow('sm');
  // Forced-title mode: `true` pins block 0 at level 1; `{ level }` overrides for nested surfaces
  const titleLevel = forcedTitle ? (typeof forcedTitle === 'object' ? forcedTitle.level : 1) : undefined;
  // Set only when an ancestor hoists the upload dialog outside this (possibly remounting) editor.
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
    // BlockNoteView's autoFocus prop only stamps a data attribute; focusing on mount is this creation option.
    autofocus: autoFocus,
    heading: { levels: headingLevels },
    trailingBlock,
    dictionary: getDictionary(),
    // Caller extensions come first: BlockNote keeps the first extension per key and drops later duplicates.
    extensions: [
      ...(extensions ?? []),
      ...(titleLevel ? [forcedTitleExtension({ level: titleLevel })] : []),
      checkedExtension(),
      syntaxHighlighter,
    ],
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

  useImperativeHandle(
    contentApiRef,
    () => ({
      getContent: () => JSON.stringify(editor.document),
      focusSummaryEnd: () => {
        editor.focus();
        // Must match the collapsed summary source in deriveDescriptionProps.
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

  useEffect(() => {
    onEditorReady?.();
  }, [onEditorReady]);

  useYjsUndoManagerFix(editor, collaborative);

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
      // The isEmpty guard avoids writing empty content before Yjs has synced.
      if (!commitOnEveryChange && !editor.isEmpty) handleUpdateData(editor);
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
      className={`${dense ? 'bn-dense' : ''} ${titleLevel ? 'bn-forced-title' : ''} ${className}`}
      // Forced-title placeholder text rides a CSS var so it stays translatable (styles.css)
      {...(titleLevel && { style: { '--bn-title-placeholder': `"${t('c:title')}"` } as React.CSSProperties })}
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
      {slashMenu && (
        <CustomSlashMenu
          editor={editor}
          allowedTypes={allowedBlockTypes}
          headingLevels={headingLevels}
          titleLevel={titleLevel}
        />
      )}

      {!isMobile && formattingToolbar && (
        <CustomFormattingToolbar headingLevels={headingLevels} titleLevel={titleLevel} />
      )}

      {sideMenu && (
        <CustomSideMenu
          editor={editor}
          allowedTypes={allowedBlockTypes}
          headingLevels={headingLevels}
          titleLevel={titleLevel}
        />
      )}

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
      ) : (
        <FilePanelController />
      )}
    </BlockNoteView>
  );
}

export { BlockNote };
