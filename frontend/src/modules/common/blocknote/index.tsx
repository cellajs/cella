import { FilePanelController, type FilePanelProps, GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { type KeyboardEventHandler, type MouseEventHandler, useCallback, useEffect, useRef, useState } from 'react';

import '~/modules/common/blocknote/app-specific-custom/styles.css';
import '~/modules/common/blocknote/styles.css';

import { useBreakpoints } from '~/hooks/use-breakpoints';
import router from '~/lib/router';
import type { CarouselItemData } from '~/modules/attachments/attachments-carousel';
import { openAttachmentDialog } from '~/modules/attachments/helpers';
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
import { compareIsContentSame, getUrlFromProps, handleSubmitOnEnter } from '~/modules/common/blocknote/helpers';
import type { BasicBlockBaseTypes, BasicFileBlockTypes, CellaCustomBlockTypes } from '~/modules/common/blocknote/types';
import type { Member } from '~/modules/memberships/types';
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
import { useUIStore } from '~/store/ui';
import { nanoid } from '~/utils/nanoid';

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
      filePanel: (props: FilePanelProps) => React.ReactElement;
      allowedFileBlockTypes?: BasicFileBlockTypes[];
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
  members,
  filePanel,
  // allow default filetypes
  allowedFileBlockTypes = filePanel ? allowedFileTypes : [],
  updateData,
  onChange,
  onEscapeClick,
  onEnterClick,
  onFocus,
  onTextDifference,
}: BlockNoteProps) => {
  const mode = useUIStore((state) => state.mode);
  const wasInitial = useRef(false);
  const editor = useCreateBlockNote({ schema: customSchema, trailingBlock });
  const isMobile = useBreakpoints('max', 'sm');

  const blockNoteRef = useRef(null);

  const isCreationMode = !!onChange;
  const [text, setText] = useState<string>(defaultValue);

  const emojiPicker = slashMenu
    ? [...customSlashIndexedItems, ...customSlashNotIndexedItems].includes('Emoji') && allowedBlockTypes.includes('emoji')
    : emojis;

  const triggerDataUpdate = async (passedText?: string) => {
    // if user in Side Menu does not update
    if (editor.sideMenu.view?.menuFrozen) return;

    // if user in Formatting Toolbar does not update
    if (editor.formattingToolbar.shown) return;

    // if user in Slash Menu does not update
    if (editor.suggestionMenus.shown) return;

    // if user in file panel does not update
    if (editor.filePanel?.shown) return;

    const textToUpdate = passedText ?? text;

    // Check if there is any difference in the content
    if (compareIsContentSame(textToUpdate, defaultValue)) return;

    updateData(textToUpdate);
  };

  const onBlockNoteChange = useCallback(async () => {
    if (!editor || !editor.document) return;

    // Converts the editor's contents from Block objects to HTML and sanitizes it
    const descriptionHtml = await editor.blocksToFullHTML(editor.document);

    const contentSame = compareIsContentSame(descriptionHtml, text);
    // Check if there is any difference in the content
    if (!contentSame) onTextDifference?.();

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
      const currentHTML = await editor.blocksToFullHTML(editor.document);

      // Only replace blocks if the content actually changes
      if (!isCreationMode && compareIsContentSame(html, currentHTML)) return;

      editor.replaceBlocks(editor.document, blocks);
    };

    blockUpdate(defaultValue);
  }, [defaultValue]);

  const onBeforeLoadHandle = useCallback(async () => {
    if (!wasInitial.current || compareIsContentSame(text, defaultValue)) return;
    updateData(text);
  }, [text, wasInitial]);

  const openAttachment: MouseEventHandler = (event) => {
    if (!altClickOpensPreview || !event.altKey) return;
    const allowedTypes: readonly string[] = allowedFileBlockTypes;
    event.preventDefault();
    editor.formattingToolbar.closeMenu();

    const { type, props } = editor.getTextCursorPosition().block;

    const url = getUrlFromProps(props);
    if (!allowedTypes.includes(type) || !url || url.length === 0) return;
    const newAttachments: CarouselItemData[] = [];

    // Collect attachments based on valid file types
    editor.forEachBlock(({ type, props }) => {
      const blockUrl = getUrlFromProps(props);

      if (allowedTypes.includes(type) && blockUrl && blockUrl.length > 0) {
        const filename = blockUrl.split('/').pop() || 'File';
        newAttachments.push({ id: nanoid(), url: blockUrl, filename, name: filename, contentType: type });
      }
      return true;
    });

    const attachmentNum = newAttachments.findIndex(({ url: newUrl }) => newUrl === url);
    openAttachmentDialog({ attachmentIndex: attachmentNum, attachments: newAttachments, triggerRef: blockNoteRef });
  };

  useEffect(() => {
    if (!updateDataOnBeforeLoad) return;
    const unsubscribe = router.subscribe('onBeforeLoad', onBeforeLoadHandle);
    return () => unsubscribe();
  }, [onBeforeLoadHandle]);

  return (
    <BlockNoteView
      id={id}
      ref={blockNoteRef}
      data-color-scheme={mode}
      theme={mode}
      // Auto focus on desktop
      autoFocus={!isMobile}
      editor={editor}
      shadCNComponents={{ Button, DropdownMenu, Popover, Tooltip, Select, Label, Input, Card, Badge, Toggle, Tabs }}
      onChange={onBlockNoteChange}
      onFocus={onFocus}
      onClick={openAttachment}
      onBlur={() => triggerDataUpdate()}
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
