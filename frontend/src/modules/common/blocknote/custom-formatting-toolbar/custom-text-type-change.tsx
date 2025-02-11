import type { BlockSchema, InlineContentSchema, StyleSchema } from '@blocknote/core';
import { BasicTextStyleButton, blockTypeSelectItems, useBlockNoteEditor, useDictionary, useEditorContentOrSelectionChange } from '@blocknote/react';
import { useMemo, useState } from 'react';
import { formattingToolBarStyleForBlocks, formattingToolBarTextStyleSelect } from '~/modules/common/blocknote/blocknote-config';
import type { BasicBlockTypes } from '~/modules/common/blocknote/types';

export const CustomTextStyleSelect = () => {
  const dict = useDictionary();
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>();
  const [block, setBlock] = useState(editor.getTextCursorPosition().block);

  const filteredItems = useMemo(
    () => blockTypeSelectItems(dict).filter((item) => formattingToolBarStyleForBlocks.includes(item.type as BasicBlockTypes)),
    [editor, dict],
  );

  const shouldShow = useMemo(() => filteredItems.some((item) => item.type === block.type), [block.type, filteredItems]);

  // Update the block on content or selection change
  useEditorContentOrSelectionChange(() => setBlock(editor.getTextCursorPosition().block), editor);

  // Early return if the block type should not show text styles
  if (!shouldShow) return null;

  return (
    <>
      {formattingToolBarTextStyleSelect.map((el) => (
        <BasicTextStyleButton key={`${el}StyleButton`} basicTextStyle={el} />
      ))}
    </>
  );
};
