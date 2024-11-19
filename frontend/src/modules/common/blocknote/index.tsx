import { FilePanelController, type FilePanelProps, GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import { type KeyboardEventHandler, type MouseEventHandler, useCallback, useEffect, useRef, useState } from 'react';
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
import type { Member } from '~/types/common';

import type { Block } from '@blocknote/core';
import { FloatingPortal } from '@floating-ui/react';

import router from '~/lib/router';
import { focusEditor, getContentAsString, getUrlFromProps, handleSubmitOnEnter } from '~/modules/common/blocknote/helpers';
import type { BasicBlockBaseTypes, BasicFileBlockTypes, CellaCustomBlockTypes } from '~/modules/common/blocknote/types';

import { type Slides, openCarouselDialog } from '~/modules/common/carousel/carousel-dialog';

import '~/modules/common/blocknote/app-specific-custom/styles.css';
import '~/modules/common/blocknote/styles.css';

type BlockNoteProps = {
  id: string;
  defaultValue?: string;
  className?: string;
  sideMenu?: boolean;
  slashMenu?: boolean;
  formattingToolbar?: boolean;
  updateDataOnBeforeLoad?: boolean;
  trailingBlock?: boolean;
  altClickOpensPreview?: boolean;
  emojis?: boolean;
  allowedBlockTypes?: (BasicBlockBaseTypes | CellaCustomBlockTypes)[];
  members?: Member[];
  updateData: (html: string) => void;
  onChange?: (value: string) => void;
  onFocus?: () => void;
  onEscapeClick?: () => void;
  onEnterClick?: () => void;
  onTextDifference?: () => void;
} & (
  | {
      // filePanel and allowedFileBlockTypes req to add together
      filePanel: (props: FilePanelProps) => JSX.Element;
      allowedFileBlockTypes: BasicFileBlockTypes[];
    }
  | {
      // if neither is provided, it allows the omission of both
      filePanel?: never;
      allowedFileBlockTypes?: never;
    }
);

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
  altClickOpensPreview = false,
  // allow default types
  allowedBlockTypes = allowedTypes,
  // allow default filetypes
  allowedFileBlockTypes = allowedFileTypes,
  members,
  updateData,
  filePanel,
  onChange,
  onEscapeClick,
  onEnterClick,
  onFocus,
  onTextDifference,
}: BlockNoteProps) => {
  const { mode } = useThemeStore();
  const wasInitial = useRef(false);
  const editor = useCreateBlockNote({ schema: customSchema, trailingBlock });

  const isCreationMode = !!onChange;
  const [text, setText] = useState<string>(defaultValue);

  const emojiPicker = slashMenu
    ? [...customSlashIndexedItems, ...customSlashNotIndexedItems].includes('Emoji') && allowedBlockTypes.includes('emoji')
    : emojis;

  const triggerDataUpdate = (passedText?: string) => {
    // if user in Side Menu does not update
    if (editor.sideMenu.view?.menuFrozen) return;

    // if user in Formatting Toolbar does not update
    if (editor.formattingToolbar.shown) return;

    // if user in Slash Menu does not update
    if (editor.suggestionMenus.shown) return;

    // if user in file panel does not update
    if (editor.filePanel?.shown) return;

    updateData(passedText ?? text);
  };

  const onBlockNoteChange = useCallback(async () => {
    if (!editor || !editor.document) return;

    // Converts the editor's contents from Block objects to HTML and sanitizes it
    const descriptionHtml = await editor.blocksToFullHTML(editor.document);

    // Get the current and old block content as strings for comparison
    const newHtml = getContentAsString(editor.document as Block[]);
    const oldBlocks = await editor.tryParseHTMLToBlocks(text);
    const oldHtml = getContentAsString(oldBlocks as Block[]);

    // Check if there is any difference in the content
    if (oldHtml !== newHtml) onTextDifference?.();

    // Update the state or trigger the onChange callback in creation mode
    if (isCreationMode) onChange?.(descriptionHtml);

    setText(descriptionHtml);
  }, [editor, text, isCreationMode, onChange, onTextDifference, setText]);

  const handleKeyDown: KeyboardEventHandler = async (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onEscapeClick?.();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();

      // to ensure that blocknote have description
      if (
        editor.document?.some((block) => {
          const content = block.content;
          return Array.isArray(content) && (content as { text: string }[])[0]?.text.trim() !== '';
        })
      ) {
        const blocksToUpdate = handleSubmitOnEnter(editor);
        if (blocksToUpdate) {
          // Converts the editor's contents from Block objects to HTML and sanitizes it
          const descriptionHtml = await editor.blocksToFullHTML(editor.document);
          triggerDataUpdate(descriptionHtml);
        }
        onEnterClick?.();
      }
    }
  };

  useEffect(() => {
    const blockUpdate = async (html: string) => {
      if (wasInitial.current && !isCreationMode) return;

      if (wasInitial.current && isCreationMode && html !== '') return;

      const blocks = await editor.tryParseHTMLToBlocks(html);

      // Get the current blocks and the new blocks' content as strings to compare them
      const currentBlocks = getContentAsString(editor.document as Block[]);
      const newBlocksContent = getContentAsString(blocks as Block[]);

      // Only replace blocks if the content actually changes
      if (!isCreationMode && currentBlocks === newBlocksContent) return;

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

  const onBeforeLoadHandle = useCallback(async () => {
    if (!wasInitial.current) return;
    updateData(text);
  }, [text, wasInitial]);

  const openCarouselPreview: MouseEventHandler = (event) => {
    if (!altClickOpensPreview || !event.altKey) return;
    const allowedTypes: readonly string[] = allowedFileBlockTypes;
    event.preventDefault();
    editor.formattingToolbar.closeMenu();

    const { type, props } = editor.getTextCursorPosition().block;

    const url = getUrlFromProps(props);
    if (!allowedTypes.includes(type) || !url || url.length === 0) return;
    const newSlides: Slides[] = [];

    // Collect slides based on valid file types
    editor.forEachBlock(({ type, props }) => {
      const blockUrl = getUrlFromProps(props);
      if (allowedTypes.includes(type) && blockUrl && blockUrl.length > 0) {
        newSlides.push({ src: blockUrl, fileType: type });
      }
      return true;
    });

    const slideNum = newSlides.findIndex(({ src }) => src === url);
    openCarouselDialog(slideNum, newSlides);
  };

  useEffect(() => {
    if (!updateDataOnBeforeLoad) return;
    const unsubscribe = router.subscribe('onBeforeLoad', onBeforeLoadHandle);
    return () => unsubscribe();
  }, [onBeforeLoadHandle]);

  return (
    <BlockNoteView
      id={id}
      data-color-scheme={mode}
      theme={mode}
      editor={editor}
      shadCNComponents={{ Button, DropdownMenu, Popover, Tooltip, Select, Label, Input, Card, Badge, Toggle, Tabs }}
      onChange={onBlockNoteChange}
      onFocus={onFocus}
      onClick={openCarouselPreview}
      onBlur={() => triggerDataUpdate()}
      onKeyDown={handleKeyDown}
      sideMenu={false}
      slashMenu={!slashMenu}
      formattingToolbar={!formattingToolbar}
      emojiPicker={!emojiPicker}
      filePanel={!filePanel}
      className={className}
    >
      {slashMenu && (
        <FloatingPortal>
          <div className="bn-ui-container">
            <CustomSlashMenu editor={editor} allowedTypes={[...allowedBlockTypes, ...allowedFileBlockTypes]} />
          </div>
        </FloatingPortal>
      )}

      {formattingToolbar && (
        <FloatingPortal>
          <div className="bn-ui-container">
            <CustomFormattingToolbar />
          </div>
        </FloatingPortal>
      )}

      {sideMenu && <CustomSideMenu editor={editor} allowedTypes={[...allowedBlockTypes, ...allowedFileBlockTypes]} />}

      {members?.length && <Mention members={members} editor={editor} />}

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
