import { FilePanelController, type FilePanelProps, GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import DOMPurify from 'dompurify';
import { type KeyboardEventHandler, useCallback, useEffect, useRef, useState } from 'react';
import * as Badge from '~/modules/ui/badge';
import * as Button from '~/modules/ui/button';
import * as Card from '~/modules/ui/card';
import * as DropdownMenu from '~/modules/ui/dropdown-menu';
import * as Input from '~/modules/ui/input';
import * as Label from '~/modules/ui/label';
import * as Popover from '~/modules/ui/popover';
import * as Select from '~/modules/ui/select';
import * as Tabs from '~/modules/ui/tabs';
import * as Toggle from '~/modules/ui/toggle';
import * as Tooltip from '~/modules/ui/tooltip';
import { useThemeStore } from '~/store/theme';

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
import { FloatingPortal } from '@floating-ui/react';
import router from '~/lib/router';
import { trimInlineContentText } from '~/modules/tasks/helpers';
import { focusEditor, getContentAsString } from './helpers';
import './styles.css';

type BlockNoteProps = {
  id: string;
  defaultValue?: string;
  className?: string;
  sideMenu?: boolean;
  slashMenu?: boolean;
  formattingToolbar?: boolean;
  updateDataOnBeforeLoad?: boolean;
  trailingBlock?: boolean;
  emojis?: boolean;
  members?: Member[];
  updateData: (html: string) => void;
  filePanel?: (props: FilePanelProps) => JSX.Element;
  onChange?: (value: string) => void;
  onFocus?: () => void;
  onKeyDown?: KeyboardEventHandler | undefined;
};

export const BlockNote = ({
  id,
  defaultValue = '',
  className = '',
  sideMenu = true,
  slashMenu = true,
  formattingToolbar = true,
  emojis = true,
  trailingBlock = true,
  updateDataOnBeforeLoad = false,
  members,
  updateData,
  filePanel,
  onChange,
  onKeyDown,
  onFocus,
}: BlockNoteProps) => {
  const { mode } = useThemeStore();
  const wasInitial = useRef(false);

  const isCreationMode = !!onChange;
  const [text, setText] = useState<string>(defaultValue);

  const onBlockNoteChange = useCallback(async () => {
    // Converts the editor's contents from Block objects to Markdown and store to state.
    const descriptionHtml = await editor.blocksToFullHTML(editor.document);
    const cleanDescription = DOMPurify.sanitize(descriptionHtml);

    const contentToUpdate = trimInlineContentText(cleanDescription);
    if (isCreationMode) onChange(contentToUpdate);
    setText(contentToUpdate);
  }, []);

  const editor = useCreateBlockNote({ schema: customSchema, trailingBlock });

  const emojiPicker = slashMenu ? [...customSlashIndexedItems, ...customSlashNotIndexedItems].includes('Emoji') : emojis;

  const triggerDataUpdate = () => {
    // if user in Formatting Toolbar does not update
    if (editor.getSelection()) return;
    updateData(text);
  };

  useEffect(() => {
    const blockUpdate = async (html: string) => {
      if (wasInitial.current && !isCreationMode) return;

      const blocks = await editor.tryParseHTMLToBlocks(html);

      // Get the current blocks and the new blocks' content as strings to compare them
      const currentBlocks = getContentAsString(editor.document as Block[]);
      const newBlocksContent = getContentAsString(blocks as Block[]);

      // Only replace blocks if the content actually changes
      if (currentBlocks === newBlocksContent) return;

      editor.replaceBlocks(editor.document, blocks);
      // Handle focus:
      // 1. In creation mode, focus the editor only if it hasn't been initialized before.
      // 2. Outside creation mode, focus the editor every time.
      if (isCreationMode) {
        if (!wasInitial.current) focusEditor(editor); // Focus only on the first initialization in creation mode
      } else focusEditor(editor); // Always focus when not in creation mode

      // Mark the editor as having been initialized
      wasInitial.current = true;
    };

    blockUpdate(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (!updateDataOnBeforeLoad) return;
    const unsubscribe = router.subscribe('onBeforeLoad', triggerDataUpdate);
    return () => unsubscribe();
  }, []);

  return (
    <BlockNoteView
      id={id}
      data-color-scheme={mode}
      theme={mode}
      editor={editor}
      shadCNComponents={{ Button, DropdownMenu, Popover, Tooltip, Select, Label, Input, Card, Badge, Toggle, Tabs }}
      onChange={onBlockNoteChange}
      onFocus={onFocus}
      onBlur={triggerDataUpdate}
      onKeyDown={onKeyDown}
      sideMenu={!sideMenu}
      slashMenu={!slashMenu}
      formattingToolbar={!formattingToolbar}
      emojiPicker={!emojiPicker}
      className={className}
    >
      {slashMenu && (
        <FloatingPortal>
          <div className="bn-ui-container">
            <CustomSlashMenu editor={editor} />
          </div>
        </FloatingPortal>
      )}

      {formattingToolbar && (
        <FloatingPortal>
          <div className="bn-ui-container">
            <CustomFormattingToolbar config={customFormattingToolBarConfig} />
          </div>
        </FloatingPortal>
      )}

      {sideMenu && <CustomSideMenu />}

      <FloatingPortal>
        <div className="bn-ui-container">
          <Mention members={members} editor={editor} />
        </div>
      </FloatingPortal>

      {emojiPicker && (
        <FloatingPortal>
          <div className="bn-ui-container">
            <GridSuggestionMenuController
              triggerCharacter={':'}
              // Changes the Emoji Picker to only have 10 columns & min length of 0.
              columns={5}
              minQueryLength={0}
            />
          </div>
        </FloatingPortal>
      )}

      {filePanel && <FilePanelController filePanel={filePanel} />}
    </BlockNoteView>
  );
};
