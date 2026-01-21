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
import {
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';
import { getPresignedUrl } from '~/api.gen';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import router from '~/lib/router';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { Mention } from '~/modules/common/blocknote/custom-elements/mention';
import { CustomFilePanel } from '~/modules/common/blocknote/custom-file-panel';
import { CustomFormattingToolbar } from '~/modules/common/blocknote/custom-formatting-toolbar';
import { CustomSideMenu } from '~/modules/common/blocknote/custom-side-menu';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu';
import { compareIsContentSame, getParsedContent, getRandomColor } from '~/modules/common/blocknote/helpers';
import { getDictionary } from '~/modules/common/blocknote/helpers/dictionary';
import { focusEditor } from '~/modules/common/blocknote/helpers/focus';
import { openAttachment } from '~/modules/common/blocknote/helpers/open-attachment';
import { shadCNComponents } from '~/modules/common/blocknote/helpers/shad-cn';
import type {
  CommonBlockNoteProps,
  CustomBlockFileTypes,
  CustomBlockNoteEditor,
  CustomBlockRegularTypes,
  CustomBlockTypes,
} from '~/modules/common/blocknote/types';
import { useUIStore } from '~/store/ui';

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
    ? {
      // The Yjs Provider responsible for transporting updates:
      provider: new WebrtcProvider(id, new Y.Doc()),
      // Where to store BlockNote data in the Y.Doc:
      fragment: new Y.Doc().getXmlFragment('document-store'),
      // Information (name and color) for this user:
      user: {
        name: user?.name || 'Anonymous User',
        color: user?.color || getRandomColor(),
      },
      // When to show user labels on the collaboration cursor. Set by default to
      // "activity" (show when the cursor moves), but can also be set to "always".
      showCursorLabels: 'activity' as const,
    }
    : undefined;

  const editor = useCreateBlockNote({
    schema: customSchema,
    heading: { levels: headingLevels },
    trailingBlock,
    dictionary: getDictionary(),
    collaboration: collaborationConfig,
    // TODO(BLOCKING) remove image blink (https://github.com/TypeCellOS/BlockNote/issues/1570)
    resolveFileUrl: (key) => {
      if (!key.length) return Promise.resolve('');

      const isPublic = String(baseFilePanelProps?.isPublic || false);
      return getPresignedUrl({ query: { key, isPublic } });
    },
  });

  const handleKeyDown: KeyboardEventHandler = useCallback(
    (event) => {
      const { metaKey, ctrlKey, key } = event;
      const isEscape = key === 'Escape';
      const isCmdEnter = key === 'Enter' && (metaKey || ctrlKey);

      // IDE-like wrapping characters
      const wrappingChars: Record<string, string> = {
        '[': ']',
        '{': '}',
        '(': ')',
        '`': '`',
        '"': '"',
        "'": "'",
      };

      // Handle character-based wrapping
      if (wrappingChars[key]) {
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
    },
    [editor, defaultValue],
  );

  const handleUpdateData = useCallback(
    (editor: CustomBlockNoteEditor) => {
      const strBlocks = JSON.stringify(editor.document);
      if (compareIsContentSame(strBlocks, defaultValue) || !updateData) return;

      updateData(strBlocks);
    },
    [defaultValue],
  );

  const handleOnBeforeLoad = useCallback(() => onBeforeLoad?.(editor), [editor]);

  const sideMenuExt = useExtensionState(SideMenuExtension, { editor });
  const suggestionMenuExt = useExtension(SuggestionMenu, { editor });
  const formattingToolbarShown = useExtensionState(FormattingToolbarExtension, {
    editor,
  });
  const filePanelShown = !!useExtensionState(FilePanelExtension, { editor });

  const handleBlur: FocusEventHandler = useCallback(
    (event) => {
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
    },
    [editor, sideMenuExt, formattingToolbarShown, suggestionMenuExt, filePanelShown],
  );

  const handleClick: MouseEventHandler = useCallback(
    (event) => {
      if (!clickOpensPreview || editable) return;

      const target = event.target as HTMLElement;

      const tagIsMedia = ['IMG', 'AUDIO', 'VIDEO'].includes(target.tagName);
      const insideFileNameDiv = !!target.closest('.bn-file-name-with-icon');
      const containsMedia = target.querySelector('img, video, audio');

      if (!tagIsMedia && !insideFileNameDiv && !containsMedia) return;

      openAttachment(event, editor, blockNoteRef);
    },
    [editable, type],
  );

  const passedContent = useMemo(() => getParsedContent(defaultValue), [defaultValue]);

  useEffect(() => {
    const currentContent = JSON.stringify(editor.document);
    if (compareIsContentSame(currentContent, defaultValue)) return;

    if (passedContent === undefined) editor.removeBlocks(editor.document);
    else editor.replaceBlocks(editor.document, passedContent);
  }, [passedContent]);

  // TODO(BLOCKING) Autofocus issue  https://github.com/TypeCellOS/BlockNote/issues/891
  useEffect(() => {
    if (!autoFocus || !editable || !editor) return;

    const intervalID = setInterval(() => {
      focusEditor(editor);
      clearInterval(intervalID);
    }, 10);

    return () => clearInterval(intervalID);
  }, [editor, editable, autoFocus]);

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
      className={className}
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
