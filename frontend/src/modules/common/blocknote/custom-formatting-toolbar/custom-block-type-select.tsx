import type { BlockSchema, InlineContentSchema, StyleSchema } from '@blocknote/core';
import {
  type BlockTypeSelectItem,
  blockTypeSelectItems,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useEditorContentOrSelectionChange,
  useSelectedBlocks,
} from '@blocknote/react';
import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';

export const CustomBlockTypeSelect = () => {
  // biome-ignore lint/style/noNonNullAssertion: required by author
  const Components = useComponentsContext()!;
  const dict = useDictionary();

  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>();

  const selectedBlocks = useSelectedBlocks(editor);
  const currentBlock = selectedBlocks[0];

  const [block, setBlock] = useState(editor.getTextCursorPosition().block);

  const filteredItems = useMemo(() => {
    return blockTypeSelectItems(dict).filter((item) => item.type in editor.schema.blockSchema);
  }, [editor, dict]);

  const shouldShow: boolean = useMemo(() => filteredItems.find((item) => item.type === block.type) !== undefined, [block.type, filteredItems]);
  const selectedItem = useMemo(() => {
    const { props, type } = currentBlock || {};
    if (props?.level) {
      // Return the first matching item with both type and level
      return filteredItems.find((el) => el.type === type && el.name.includes(props.level));
    }
    return filteredItems.find((el) => el.type === type);
  }, [filteredItems, currentBlock]);

  const fullItems = useMemo(() => {
    const onClick = (item: BlockTypeSelectItem) => {
      editor.focus();

      for (const block of selectedBlocks) {
        editor.updateBlock(block, {
          type: item.type,
          // biome-ignore lint/suspicious/noExplicitAny: required by author
          props: item.props as any,
        });
      }
    };

    return filteredItems.map((item) => {
      const Icon = item.icon;

      return {
        title: item.name,
        icon: <Icon size={16} />,
        onClick: () => onClick(item),
        isSelected: item.isSelected(block),
      };
    });
  }, [block, filteredItems, editor, selectedBlocks]);

  useEditorContentOrSelectionChange(() => {
    setBlock(editor.getTextCursorPosition().block);
  }, editor);

  if (!shouldShow || !editor.isEditable) return null;

  return (
    <Components.Generic.Menu.Root>
      <Components.Generic.Menu.Trigger>
        <Components.FormattingToolbar.Button className="bn-dropdown-button" label={selectedItem?.name ?? ''} mainTooltip="Select block type">
          {selectedItem && <selectedItem.icon />}
          <ChevronDown size={16} />
        </Components.FormattingToolbar.Button>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown className="bn-menu-dropdown">
        {fullItems.map((el) => (
          <Components.Generic.Menu.Item className="bn-menu-item" key={el.title} onClick={el.onClick} icon={el.icon} checked={el.isSelected}>
            {el.title}
          </Components.Generic.Menu.Item>
        ))}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
};
