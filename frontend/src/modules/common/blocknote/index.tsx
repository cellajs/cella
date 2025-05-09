import { FilePanelController, GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { type FocusEventHandler, type MouseEventHandler, useCallback, useEffect, useMemo, useRef } from 'react';

import { useBreakpoints } from '~/hooks/use-breakpoints';
import router from '~/lib/router';
import {
  allowedFileTypes,
  allowedTypes,
  customSchema,
  customSlashIndexedItems,
  customSlashNotIndexedItems,
} from '~/modules/common/blocknote/blocknote-config';
import { Mention } from '~/modules/common/blocknote/custom-elements/mention';
import { CustomFormattingToolbar } from '~/modules/common/blocknote/custom-formatting-toolbar';
import { CustomSideMenu } from '~/modules/common/blocknote/custom-side-menu';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu';
import { compareIsContentSame, getParsedContent } from '~/modules/common/blocknote/helpers';
import { focusEditor } from '~/modules/common/blocknote/helpers/focus';
import { createHandleKeyDown } from '~/modules/common/blocknote/helpers/key-down';
import { openAttachment } from '~/modules/common/blocknote/helpers/open-attachment';
import { shadCNComponents } from '~/modules/common/blocknote/helpers/shad-cn';
import type { BaseBlockNoteProps } from '~/modules/common/blocknote/types';
import { getPriasignedUrl } from '~/modules/system/api';
import { useUIStore } from '~/store/ui';

import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/app-specific-custom/styles.css';
import '~/modules/common/blocknote/styles.css';

type BlockNoteEditorProps = BaseBlockNoteProps & {
  updateDataOnBeforeLoad?: boolean;
  updateData: (srtBlocks: string) => void;
};

//TODO(REFACTOR) to create base BlockNoteEditor and then just pass edit or create related stuff
export const BlockNoteEditor = ({
  id,
  defaultValue = '',
  className = '',
  sideMenu = true,
  slashMenu = true,
  formattingToolbar = true,
  emojis = true,
  trailingBlock = true,
  updateDataOnBeforeLoad = false,
  altClickOpensPreview = false,
  // allow default types
  allowedBlockTypes = allowedTypes,
  members,
  filePanel,
  // allow default filetypes
  allowedFileBlockTypes = filePanel ? allowedFileTypes : [],
  updateData,
  onEscapeClick,
  onEnterClick,
  onFocus,
}: BlockNoteEditorProps) => {
  const mode = useUIStore((state) => state.mode);
  const isMobile = useBreakpoints('max', 'sm');

  const blockNoteRef = useRef<HTMLDivElement | null>(null);
  const editor = useCreateBlockNote({
    schema: customSchema,
    trailingBlock,
    // TODO(BLOCKING) remove image blick (https://github.com/TypeCellOS/BlockNote/issues/1570)
    resolveFileUrl: (key) => {
      if (!key.length) return Promise.resolve('');
      return getPriasignedUrl({ key });
    },
  });

  const emojiPicker = slashMenu
    ? [...customSlashIndexedItems, ...customSlashNotIndexedItems].includes('Emoji') && allowedBlockTypes.includes('emoji')
    : emojis;

  const handleDataUpdate = useCallback(() => {
    const strBlocks = JSON.stringify(editor.document);
    // Check if there is any difference in the content
    if (compareIsContentSame(strBlocks, defaultValue)) return;
    updateData(strBlocks);
  }, [editor]);

  const handleKeyDown = useCallback(
    createHandleKeyDown({
      editor,
      handleDataUpdate,
      onEnterClick,
      onEscapeClick,
    }),
    [editor],
  );
  const handleClick: MouseEventHandler = (event) => openAttachment(event, editor, altClickOpensPreview, blockNoteRef);
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
      handleDataUpdate();
    },
    [editor],
  );
  const passedContent = useMemo(() => getParsedContent(defaultValue), [defaultValue]);

  useEffect(() => {
    const currentContent = JSON.stringify(editor.document);
    if (compareIsContentSame(currentContent, defaultValue)) return;

    // TODO(BLOCKING) (https://github.com/TypeCellOS/BlockNote/issues/1513)
    queueMicrotask(() => {
      if (passedContent === undefined) editor.removeBlocks(editor.document);
      else editor.replaceBlocks(editor.document, passedContent);
    });
  }, [passedContent]);

  useEffect(() => {
    if (!updateDataOnBeforeLoad) return;
    const unsubscribe = router.subscribe('onBeforeLoad', handleDataUpdate);
    return () => unsubscribe();
  }, [handleDataUpdate]);

  // TODO(BLOCKING) https://github.com/TypeCellOS/BlockNote/issues/891
  useEffect(() => {
    const intervalID = setInterval(() => {
      if (editor) {
        focusEditor(editor);
        clearInterval(intervalID);
      }
    }, 10);

    return () => clearInterval(intervalID);
  }, [editor]);

  return (
    <BlockNoteView
      id={id}
      ref={blockNoteRef}
      data-color-scheme={mode}
      theme={mode}
      editor={editor}
      shadCNComponents={shadCNComponents}
      onFocus={onFocus}
      onClick={handleClick}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      sideMenu={false}
      slashMenu={!slashMenu}
      formattingToolbar={!formattingToolbar}
      emojiPicker={!emojiPicker}
      filePanel={!filePanel}
      className={className}
    >
      {slashMenu && <CustomSlashMenu editor={editor} allowedTypes={[...allowedBlockTypes, ...allowedFileBlockTypes]} />}

      {/* Hide formatting toolbar on mobile */}
      {!isMobile && formattingToolbar && <CustomFormattingToolbar />}

      {/* By default hides on mobile */}
      {sideMenu && <CustomSideMenu editor={editor} allowedTypes={[...allowedBlockTypes, ...allowedFileBlockTypes]} />}

      {/* To avoid rendering "0" */}
      {members?.length ? <Mention members={members} editor={editor} /> : null}

      {emojiPicker && (
        <GridSuggestionMenuController
          triggerCharacter={':'}
          // Changes the Emoji Picker to only have 10 columns & min length of 0.
          columns={8}
          minQueryLength={0}
        />
      )}

      {filePanel && <FilePanelController filePanel={filePanel} />}
    </BlockNoteView>
  );
};
