import type { BlockSchema, InlineContentSchema, StyleSchema } from '@blocknote/core';
import {
  BasicTextStyleButton,
  blockTypeSelectItems,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useEditorContentOrSelectionChange,
} from '@blocknote/react';
import { ALargeSmall, ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { canChangeStyleForBlocks, customTextStyleSelect } from '~/modules/common/blocknote/blocknote-config';
import type { BlockTypes } from '~/modules/common/blocknote/types';

export const CustomTextStyleSelect = () => {
  // biome-ignore lint/style/noNonNullAssertion: required by author
  const Components = useComponentsContext()!;
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
    <Components.Generic.Menu.Root>
      <Components.Generic.Menu.Trigger>
        <Components.FormattingToolbar.Button className="bn-dropdown-button" label="Text style select" mainTooltip="Select text style">
          <ALargeSmall size={22} />
          <ChevronDown size={14} />
        </Components.FormattingToolbar.Button>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown>
        <Components.Generic.Menu.Item className="no-hover-bg">
          {customTextStyleSelect.map((el) => (
            <BasicTextStyleButton basicTextStyle={el} key={`${el}StyleButton`} />
          ))}
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
};
