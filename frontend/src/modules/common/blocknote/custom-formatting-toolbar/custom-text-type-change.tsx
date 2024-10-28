import type { BlockSchema, InlineContentSchema, StyleSchema } from '@blocknote/core';
import { BasicTextStyleButton, blockTypeSelectItems, useBlockNoteEditor, useDictionary, useEditorContentOrSelectionChange } from '@blocknote/react';
import { useMemo, useState } from 'react';
import { canChangeStyleForBlocks, customTextStyleSelect } from '~/modules/common/blocknote/blocknote-config';
import type { BlockTypes } from '~/modules/common/blocknote/types';

export const CustomTextStyleSelect = () => {
  const dict = useDictionary();
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>();

  const [block, setBlock] = useState(editor.getTextCursorPosition().block);

  const filteredItems = useMemo(() => {
    return blockTypeSelectItems(dict).filter((item) => canChangeStyleForBlocks.includes(item.type as BlockTypes));
  }, [editor, dict]);
  const shouldShow: boolean = useMemo(() => filteredItems.find((item) => item.type === block.type) !== undefined, [block.type, filteredItems]);

  useEditorContentOrSelectionChange(() => {
    setBlock(editor.getTextCursorPosition().block);
  }, editor);
  if (!shouldShow) return null;

  return (
    <>
      {customTextStyleSelect.map((el) => (
        <BasicTextStyleButton basicTextStyle={el} key={`${el}StyleButton`} />
      ))}
    </>
  );
};
