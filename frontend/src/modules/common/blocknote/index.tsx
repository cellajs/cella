import { codeBlock } from '@blocknote/code-block';
import { FilePanelController, GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { type FocusEventHandler, type KeyboardEventHandler, type MouseEventHandler, useCallback, useEffect, useMemo, useRef } from 'react';

import { useBreakpoints } from '~/hooks/use-breakpoints';
import router from '~/lib/router';
import {
  allowedFileTypes,
  allowedTypes,
  customSchema,
  customSlashIndexedItems,
  customSlashNotIndexedItems,
  supportedLanguages,
} from '~/modules/common/blocknote/blocknote-config';
import { Mention } from '~/modules/common/blocknote/custom-elements/mention';
import { CustomFormattingToolbar } from '~/modules/common/blocknote/custom-formatting-toolbar';
import { CustomSideMenu } from '~/modules/common/blocknote/custom-side-menu';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu';
import { compareIsContentSame, getParsedContent } from '~/modules/common/blocknote/helpers';
import { focusEditor } from '~/modules/common/blocknote/helpers/focus';
import { openAttachment } from '~/modules/common/blocknote/helpers/open-attachment';
import { shadCNComponents } from '~/modules/common/blocknote/helpers/shad-cn';
import type { CommonBlockNoteProps, CustomBlockNoteEditor } from '~/modules/common/blocknote/types';
import { getPriasignedUrl } from '~/modules/system/api';
import { useUIStore } from '~/store/ui';

import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/app-specific-custom/styles.css';
import '~/modules/common/blocknote/styles.css';

type BlockNoteProps =
  | (CommonBlockNoteProps & {
      type: 'edit' | 'create';
      updateData: (strBlocks: string) => void;
    })
  | (CommonBlockNoteProps & {
      type: 'preview';
      updateData?: never;
      onEscapeClick?: never;
      onEnterClick?: never;
      onBeforeLoad?: never;
    });

export const BlockNote = ({
  id,
  type,
  className = '',
  defaultValue = '', // stringified blocks
  trailingBlock = true,
  altClickOpensPreview = false,
  // Editor functional
  codeBlockDefaultLanguage = 'text',
  editable = true,
  sideMenu = true,
  slashMenu = true,
  formattingToolbar = true,
  emojis = true,
  allowedBlockTypes = allowedTypes, // default types
  members, // for mentions
  filePanel,
  allowedFileBlockTypes = filePanel ? allowedFileTypes : [], // default filetypes
  // Functions
  updateData,
  onEscapeClick,
  onEnterClick, // Trigger on Cmd+Enter
  onFocus,
  onBeforeLoad,
}: BlockNoteProps) => {
  const mode = useUIStore((state) => state.mode);
  const isMobile = useBreakpoints('max', 'sm');

  const blockNoteRef = useRef<HTMLDivElement | null>(null);

  const emojiPicker = slashMenu
    ? [...customSlashIndexedItems, ...customSlashNotIndexedItems].includes('Emoji') && allowedBlockTypes.includes('emoji')
    : emojis;

  const editor = useCreateBlockNote({
    schema: customSchema,
    codeBlock: {
      indentLineWithTab: true,
      defaultLanguage: codeBlockDefaultLanguage,
      supportedLanguages,
      createHighlighter: codeBlock.createHighlighter,
    },
    trailingBlock,
    // TODO(BLOCKING) remove image blick (https://github.com/TypeCellOS/BlockNote/issues/1570)
    resolveFileUrl: (key) => {
      if (!key.length) return Promise.resolve('');
      return getPriasignedUrl({ key });
    },
  });

  const handleKeyDown: KeyboardEventHandler = useCallback(
    (event) => {
      const isEscape = event.key === 'Escape';
      const isCmdEnter = (event.metaKey || event.ctrlKey) && event.key === 'Enter';
      if (!isCmdEnter && !isEscape) return;
      event.preventDefault();

      if (isEscape) onEscapeClick?.();

      if (isCmdEnter) {
        event.stopPropagation();
        onEnterClick?.();
        if (!editor.isEmpty) handleUpdateData(editor);
      }
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

  const handleBlur: FocusEventHandler = useCallback(
    (event) => {
      // if user in Side Menu does not update
      if (editor.sideMenu.view?.menuFrozen) return;

      // if user in Formatting Toolbar does not update
      if (editor.formattingToolbar.shown) return;

      // if user in Slash Menu does not update
      if (editor.suggestionMenus.shown) return;

      // if user in file panel does not update
      if (editor.filePanel?.shown) return;

      const nextFocused = event.relatedTarget;
      // Check if the next focused element is still inside the editor
      if (nextFocused && blockNoteRef.current && blockNoteRef.current.contains(nextFocused)) return;

      if (type === 'edit') handleUpdateData(editor);
    },
    [editor, defaultValue],
  );
  const handleClick: MouseEventHandler = (event) => {
    if (altClickOpensPreview) openAttachment(event, editor, blockNoteRef);
  };

  const passedContent = useMemo(() => getParsedContent(defaultValue), [defaultValue]);

  useEffect(() => {
    const currentContent = JSON.stringify(editor.document);
    if (compareIsContentSame(currentContent, defaultValue)) return;

    if (passedContent === undefined) editor.removeBlocks(editor.document);
    else editor.replaceBlocks(editor.document, passedContent);
  }, [passedContent]);

  // TODO(BLOCKING) https://github.com/TypeCellOS/BlockNote/issues/891
  useEffect(() => {
    if (type === 'preview' || !editable || !editor) return;

    const intervalID = setInterval(() => {
      focusEditor(editor);
      clearInterval(intervalID);
    }, 10);

    return () => clearInterval(intervalID);
  }, [editor, editable]);

  useEffect(() => {
    if (!onBeforeLoad) return;
    const unsubscribe = router.subscribe('onBeforeLoad', handleOnBeforeLoad);
    return () => unsubscribe();
  }, []);

  return (
    <BlockNoteView
      id={id}
      theme={mode}
      editor={editor}
      editable={type === 'preview' ? false : editable}
      ref={blockNoteRef}
      className={className}
      data-color-scheme={mode}
      shadCNComponents={shadCNComponents}
      sideMenu={false}
      slashMenu={!slashMenu}
      formattingToolbar={!formattingToolbar}
      emojiPicker={!emojiPicker}
      filePanel={!filePanel}
      onFocus={onFocus}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      {...(type === 'create' && { onChange: handleUpdateData })}
    >
      {slashMenu && <CustomSlashMenu editor={editor} allowedTypes={[...allowedBlockTypes, ...allowedFileBlockTypes]} />}

      {/* Hide formatting toolbar on mobile */}
      {!isMobile && formattingToolbar && <CustomFormattingToolbar />}

      {/* By default hides on mobile */}
      {sideMenu && <CustomSideMenu editor={editor} allowedTypes={[...allowedBlockTypes, ...allowedFileBlockTypes]} />}

      {/* To avoid rendering "0" */}
      {members?.length ? <Mention members={members} editor={editor} /> : null}

      {/* Changes the Emoji Picker to only have 10 columns & min length of 0. */}
      {emojiPicker && <GridSuggestionMenuController triggerCharacter={':'} columns={8} minQueryLength={0} />}

      {filePanel && <FilePanelController filePanel={filePanel} />}
    </BlockNoteView>
  );
};
