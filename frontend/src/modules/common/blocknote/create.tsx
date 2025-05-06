import { FilePanelController, GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { type MouseEventHandler, useCallback, useEffect, useMemo, useRef } from 'react';

import { useBreakpoints } from '~/hooks/use-breakpoints';
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
import type { BaseBlockNoteProps, CustomBlockNoteEditor } from '~/modules/common/blocknote/types';
import { useUIStore } from '~/store/ui';

import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/app-specific-custom/styles.css';
import '~/modules/common/blocknote/styles.css';

export type BlockNoteCreateProps = BaseBlockNoteProps & {
  onChange: (value: string) => void;
};

export const BlockNoteCreate = ({
  id,
  defaultValue = '',
  className = '',
  sideMenu = true,
  slashMenu = true,
  formattingToolbar = true,
  emojis = true,
  trailingBlock = true,
  altClickOpensPreview = false,
  // allow default types
  allowedBlockTypes = allowedTypes,
  members,
  filePanel,
  // allow default filetypes
  allowedFileBlockTypes = filePanel ? allowedFileTypes : [],
  onChange,
  onEscapeClick,
  onEnterClick,
  onFocus,
}: BlockNoteCreateProps) => {
  const mode = useUIStore((state) => state.mode);
  const isMobile = useBreakpoints('max', 'sm');

  const blockNoteRef = useRef(null);
  const editor = useCreateBlockNote({ schema: customSchema, trailingBlock });

  const emojiPicker = slashMenu
    ? [...customSlashIndexedItems, ...customSlashNotIndexedItems].includes('Emoji') && allowedBlockTypes.includes('emoji')
    : emojis;

  const handleKeyDown = useCallback(createHandleKeyDown({ editor, handleDataUpdate: onChange, onEnterClick, onEscapeClick }), [editor]);
  const handleClick: MouseEventHandler = (event) => openAttachment(event, editor, altClickOpensPreview, blockNoteRef);
  const handleChange = (editor: CustomBlockNoteEditor) => {
    const strBlocks = JSON.stringify(editor.document);
    onChange(strBlocks);
  };

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
      onChange={handleChange}
      onFocus={onFocus}
      onClick={handleClick}
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
