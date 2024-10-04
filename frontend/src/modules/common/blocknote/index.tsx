import { GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import DOMPurify from 'dompurify';
import { useLayoutEffect, useRef } from 'react';
import { useThemeStore } from '~/store/theme';
import { cn } from '~/utils/cn';

import {
  customFormattingToolBarConfig,
  customSchema,
  customSlashIndexedItems,
  customSlashNotIndexedItems,
} from '~/modules/common/blocknote/blocknote-config';
import { Mention } from '~/modules/common/blocknote/custom-elements/mention';
import { CustomFormattingToolbar } from '~/modules/common/blocknote/custom-formatting-toolbar';
import { CustomSideMenu } from '~/modules/common/blocknote/custom-side-menu';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu';
import type { Member } from '~/types/common';

import type { Block } from '@blocknote/core';
import { getContentAsString } from './helpers';
import './styles.css';

type BlockNoteProps = {
  id: string;
  triggerUpdateOnChange: boolean;
  defaultValue?: string;
  className?: string;
  sideMenu?: boolean;
  slashMenu?: boolean;
  formattingToolbar?: boolean;
  customSideMenu?: boolean;
  customSlashMenu?: boolean;
  customFormattingToolbar?: boolean;
  emojis?: boolean;
  members?: Member[];
  updateData: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: () => void;
};

export const BlockNote = ({
  id,
  triggerUpdateOnChange,
  defaultValue = '',
  className = '',
  sideMenu = true,
  slashMenu = true,
  formattingToolbar = true,
  customSideMenu = false,
  customSlashMenu = false,
  customFormattingToolbar = false,
  emojis = true,
  members,
  updateData,
  onKeyDown,
  onBlur,
  onFocus,
}: BlockNoteProps) => {
  const { mode } = useThemeStore();
  const wasInitial = useRef(false);

  const editor = useCreateBlockNote({ schema: customSchema });

  const emojiPicker = customSlashMenu ? [...customSlashIndexedItems, ...customSlashNotIndexedItems].includes('Emoji') : emojis;

  const onBlockNoteChange = async () => {
    //if user in Formatting Toolbar does not update
    if (editor.getSelection()) return;

    const descriptionHtml = await editor.blocksToFullHTML(editor.document);
    const cleanDescription = DOMPurify.sanitize(descriptionHtml);
    updateData(cleanDescription);
  };

  useLayoutEffect(() => {
    const blockUpdate = async (html: string) => {
      const blocks = await editor.tryParseHTMLToBlocks(html);
      const currentBlocks = getContentAsString(editor.document as Block[]);
      const newBlocksContent = getContentAsString(blocks as Block[]);

      // Only replace blocks if the content actually changes
      if (currentBlocks !== newBlocksContent || html === '') {
        editor.replaceBlocks(editor.document, blocks);
        const lastBlock = editor.document[editor.document.length - 1];
        editor.focus();
        editor.setTextCursorPosition(lastBlock.id, 'end');
        if (!wasInitial.current) wasInitial.current = true;
      }
    };
    blockUpdate(defaultValue);
  }, [defaultValue]);

  return (
    <BlockNoteView
      id={id}
      data-color-scheme={mode}
      theme={mode}
      editor={editor}
      defaultValue={defaultValue}
      onChange={() => {
        // to avoid update if content empty, so from draft shown
        if (!triggerUpdateOnChange || editor.document[0].content?.toString() === '') return;
        queueMicrotask(() => onBlockNoteChange());
      }}
      onFocus={() => queueMicrotask(() => onFocus?.())}
      onBlur={() => queueMicrotask(() => onBlur?.())}
      onKeyDown={onKeyDown}
      sideMenu={customSideMenu ? false : sideMenu}
      slashMenu={customSlashMenu ? false : slashMenu}
      formattingToolbar={customFormattingToolbar ? false : formattingToolbar}
      emojiPicker={!emojiPicker}
      className={cn('p-3 border rounded-md', className)}
    >
      {customSlashMenu && <CustomSlashMenu editor={editor} />}
      {customFormattingToolbar && (
        <div className="fixed">
          <CustomFormattingToolbar config={customFormattingToolBarConfig} />
        </div>
      )}
      {customSideMenu && <CustomSideMenu />}
      <Mention members={members} editor={editor} />
      {emojiPicker && (
        <GridSuggestionMenuController
          triggerCharacter={':'}
          // Changes the Emoji Picker to only have 10 columns & min length of 0.
          columns={5}
          minQueryLength={0}
        />
      )}
    </BlockNoteView>
  );
};
