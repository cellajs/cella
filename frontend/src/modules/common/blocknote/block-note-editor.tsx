import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';
import '~/modules/common/blocknote/custom-elements/checklist/checklist-styles.css';

import {
  FilePanelExtension,
  FormattingToolbarExtension,
  SideMenuExtension,
  SuggestionMenu,
} from '@blocknote/core/extensions';
import { GridSuggestionMenuController, useCreateBlockNote, useExtension, useExtensionState } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { type FocusEventHandler, type KeyboardEventHandler, type MouseEventHandler, useEffect, useRef } from 'react';
import type { ProductEntityType } from 'shared';
import type { WebsocketProvider } from 'y-websocket';
import type { XmlFragment } from 'yjs';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { getFileUrl } from '~/modules/attachment/file-url';
import { findAttachmentInCache } from '~/modules/attachment/query';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { checkedExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';
import { Mention } from '~/modules/common/blocknote/custom-elements/mention/mention-menu';
import { CustomFilePanel } from '~/modules/common/blocknote/custom-file-panel/file-panel';
import { CustomFormattingToolbar } from '~/modules/common/blocknote/custom-formatting-toolbar/formatting-toolbar';
import { CustomSideMenu } from '~/modules/common/blocknote/custom-side-menu/side-menu';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu/slash-menu';
import { clearYjsUndoManagerStacks, getParsedContent } from '~/modules/common/blocknote/helpers/blocknote-helpers';
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
import { useDerivedFieldsSender } from '~/modules/common/blocknote/use-derived-fields-sender';
import { useYjsEditorStore } from '~/modules/common/blocknote/yjs-editor';
import { useUIStore } from '~/modules/ui/ui-store';
import router from '~/routes/router';

// IDE-like wrapping characters (constant, no need to recreate per keystroke)
const wrappingChars: Record<string, string> = {
  '[': ']',
  '{': '}',
  '(': ')',
  '`': '`',
  '"': '"',
  "'": "'",
};

/** Pre-built collaboration config from the connection manager store. */
interface CollaborationConfig {
  provider: WebsocketProvider;
  fragment: XmlFragment;
  user: { name: string; color: string };
  showCursorLabels?: 'activity' | 'always';
}

type BlockNoteProps =
  | (CommonBlockNoteProps & {
      type: 'edit' | 'create';
      updateData: (strBlocks: string) => void;
      autoFocus?: boolean;
      collaborative: true;
      collaboration: CollaborationConfig;
      entityType: ProductEntityType;
      entityId: string;
      /** Callback that sends description update through a React Query mutation (fires lifecycle hooks). */
      sendDerivedUpdate: (entityId: string, description: string) => Promise<void>;
    })
  | (CommonBlockNoteProps & {
      type: 'edit' | 'create';
      updateData: (strBlocks: string) => void;
      autoFocus?: boolean;
      collaborative?: false | undefined;
      collaboration?: never;
      entityType?: never;
      entityId?: never;
      sendDerivedUpdate?: never;
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
      collaboration?: never;
      entityType?: never;
      entityId?: never;
      sendDerivedUpdate?: never;
    });

const EMPTY_BLOCK_TYPES: CustomBlockRegularTypes[] = [];
const EMPTY_FILE_BLOCK_TYPES: CustomBlockFileTypes[] = [];

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
  excludeBlockTypes = EMPTY_BLOCK_TYPES, // default types
  excludeFileBlockTypes = EMPTY_FILE_BLOCK_TYPES, // default filetypes
  extensions,
  members, // for mentions
  publicFiles,
  filePanel,
  baseFilePanelProps,
  // Collaboration
  collaborative = false,
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

  const blockNoteRef = useRef<HTMLDivElement | null>(null);

  // Refs to capture latest values for unmount cleanup (closure would stale otherwise)
  const updateDataRef = useRef(updateData);
  updateDataRef.current = updateData;
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  const defaultAllowedBlockTypes = Object.keys(customSchema.blockSpecs) as CustomBlockTypes[];
  const allowedBlockTypes = defaultAllowedBlockTypes.filter(
    (type) =>
      !excludeBlockTypes.includes(type as CustomBlockRegularTypes) &&
      !excludeFileBlockTypes.includes(type as CustomBlockFileTypes),
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
      const cachedAttachment = isAttachmentId ? findAttachmentInCache(key) : null;
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

  // Fix Yjs UndoManager after TipTap mount/unmount cycles.
  // React StrictMode (dev) and editability changes trigger unmount→remount of the
  // EditorView. The yUndoPlugin's view.destroy() calls undoManager.destroy(), which
  // unsubscribes it from Y.Doc's afterTransaction event. On remount, the destroyed
  // UndoManager is reused from the plugin state and can't capture new changes.
  // This effect re-subscribes the UndoManager after each mount so CMD+Z works.
  // TODO refactor this
  useEffect(() => {
    if (!collaborative) return;

    const tiptap = editor._tiptapEditor;

    const resubscribeUndoManager = () => {
      try {
        const pmState = tiptap.state;
        if (!pmState) return;

        // Find the ySyncPlugin state (contains the Y.Doc)
        // and the yUndoPlugin state (contains the UndoManager)
        let doc: { on: (e: string, h: unknown) => void; off: (e: string, h: unknown) => void } | undefined;
        let undoManager: { afterTransactionHandler: unknown } | undefined;

        for (const plugin of pmState.plugins) {
          const s = plugin.getState(pmState) as Record<string, unknown> | undefined;
          if (!s) continue;
          if (s.doc && typeof (s.doc as Record<string, unknown>).on === 'function') doc = s.doc as typeof doc;
          if (s.undoManager && typeof (s as Record<string, unknown>).undoManager === 'object') {
            undoManager = s.undoManager as typeof undoManager;
          }
        }

        if (doc && undoManager?.afterTransactionHandler) {
          doc.off('afterTransaction', undoManager.afterTransactionHandler);
          doc.on('afterTransaction', undoManager.afterTransactionHandler);
        }
      } catch {
        // Non-critical — if this fails, undo just won't work until next mount
      }
    };

    // Fix immediately (editor is already mounted by the time this effect runs)
    resubscribeUndoManager();

    // Also fix on future mounts (e.g. editability changes cause unmount→remount)
    tiptap.on('mount', resubscribeUndoManager);

    return () => {
      tiptap.off('mount', resubscribeUndoManager);
    };
  }, [collaborative, editor]);

  // Register/unregister entity with Yjs editor store for SSE suppression
  useEffect(() => {
    if (!collaborative || !entityTypeProp || !entityIdProp) return;
    useYjsEditorStore.getState().register(entityTypeProp, entityIdProp);
    return () => useYjsEditorStore.getState().unregister(entityTypeProp, entityIdProp);
  }, [collaborative, entityTypeProp, entityIdProp]);

  // Send derived fields (summary, checkbox counts, etc.) to backend in collaborative mode
  const { markContentAsSent } = useDerivedFieldsSender(
    collaborative && entityIdProp && sendDerivedUpdate
      ? {
          entityId: entityIdProp,
          editor,
          sendUpdate: sendDerivedUpdate,
        }
      : null,
  );

  // Seed Y.Doc with existing content on first sync when document is empty
  useEffect(() => {
    const provider = collaboration?.provider;
    if (!provider || !defaultValue) return;

    let handled = false;

    const handleSync = (isSynced: boolean) => {
      if (!isSynced || handled) return;
      handled = true;
      // Unsubscribe immediately — reconnects must not clear the user's undo history
      provider.off('sync', handleSync);

      // If the editor is empty after sync, seed it with existing data
      if (editor.isEmpty) {
        const parsed = getParsedContent(defaultValue);
        if (parsed) {
          editor.replaceBlocks(editor.document, parsed);
          // Clear Yjs UndoManager stacks so the seed isn't undoable
          clearYjsUndoManagerStacks(editor);
        }
      }
      // Mark current content as baseline so the seed doesn't trigger a spurious PUT
      markContentAsSent();
    };

    // Check if already synced
    if (provider.synced) {
      handleSync(true);
    } else {
      provider.on('sync', handleSync);
    }
    return () => provider.off('sync', handleSync);
  }, []); // Run once on mount

  const handleKeyDown: KeyboardEventHandler = (event) => {
    const { metaKey, ctrlKey, key } = event;
    const isEscape = key === 'Escape';
    const isCmdEnter = key === 'Enter' && (metaKey || ctrlKey);

    // Handle IDE-like character wrapping around selection
    if (key in wrappingChars) {
      const pmState = editor.prosemirrorState;
      const { from, to } = pmState.selection;

      if (from !== to) {
        event.preventDefault();

        const closing = wrappingChars[key];
        const tr = pmState.tr;
        // Insert closing char first (at `to`) so `from` offset stays valid
        tr.insertText(closing, to);
        tr.insertText(key, from);
        editor.prosemirrorView.dispatch(tr);

        return;
      }
    }

    // Skip everything else if it's not special command
    if (!isEscape && !isCmdEnter) return;

    event.preventDefault();

    // Escape handling
    if (isEscape) {
      if (!editor.isEmpty) handleUpdateData(editor);
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
    if (strBlocks === defaultValue || !updateData) return;

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

    // In collaborative mode, only write to cache when editor has content (prevents
    // writing empty content before Yjs sync completes). Derived fields sender handles
    // backend persistence; updateData only patches the query cache in collab mode.
    if (type === 'edit' && !editor.isEmpty) handleUpdateData(editor);
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

  useEffect(() => {
    if (!onBeforeLoad || !editable) return;
    const unsubscribe = router.subscribe('onBeforeLoad', handleOnBeforeLoad);
    return () => unsubscribe();
  }, []);

  // Flush unsaved content on unmount (e.g. virtualizer drops the card while editing)
  // Guard with !editor.isEmpty to prevent writing empty content before collab sync
  useEffect(() => {
    return () => {
      if (!updateDataRef.current || editor.isEmpty) return;
      const strBlocks = JSON.stringify(editor.document);
      if (strBlocks !== defaultValueRef.current) {
        updateDataRef.current(strBlocks);
      }
    };
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
