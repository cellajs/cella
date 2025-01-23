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
import { customBlockTypeSelectItems } from '~/modules/common/blocknote/blocknote-config';
import type { BasicBlockTypes } from '~/modules/common/blocknote/types';

export const CellaCustomBlockTypeSelect = () => {
  // biome-ignore lint/style/noNonNullAssertion: required by author
  const Components = useComponentsContext()!;
  const dict = useDictionary();
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>();

  const selectedBlocks = useSelectedBlocks(editor);
  const currentBlock = selectedBlocks[0];

  const [block, setBlock] = useState(editor.getTextCursorPosition().block);

  const filteredItems = useMemo(
    () => blockTypeSelectItems(dict).filter((item) => customBlockTypeSelectItems.includes(item.type as BasicBlockTypes)),
    [editor, dict],
  );

  const shouldShow = useMemo(() => filteredItems.some((item) => item.type === block.type), [block.type, filteredItems]);

  const selectedItem = useMemo(() => {
    // Return the first matching item with both type and level
    if (currentBlock?.props?.level) {
      return filteredItems.find((el) => el.type === currentBlock.type && el.name.includes(currentBlock.props.level));
    }
    return filteredItems.find((el) => el.type === currentBlock.type);
  }, [filteredItems, currentBlock]);

  // Handle item click for updating the block type
  const handleItemClick = (item: BlockTypeSelectItem) => {
    editor.focus();
    for (const block of selectedBlocks) {
      editor.updateBlock(block, {
        type: item.type,
        // biome-ignore lint/suspicious/noExplicitAny: required by author
        props: item.props as any, // Pass props (to get heading level: 1 | 2 | 3)
      });
    }
  };

  const fullItems = useMemo(
    () =>
      filteredItems.map((item) => {
        const { icon: Icon, isSelected, name } = item;
        return {
          title: name,
          icon: <Icon size={16} />,
          onClick: () => handleItemClick(item),
          isSelected: isSelected(block),
        };
      }),
    [block, filteredItems, editor, selectedBlocks],
  );

  // Update the block whenever the editor content or selection changes
  useEditorContentOrSelectionChange(() => setBlock(editor.getTextCursorPosition().block), editor);

  // Return null if the menu should not be shown or the editor is not editable
  if (!shouldShow || !editor.isEditable) return null;

  return (
    <Components.Generic.Menu.Root>
      <Components.Generic.Menu.Trigger>
        <Components.FormattingToolbar.Button className="bn-dropdown-button" label={selectedItem?.name ?? ''} mainTooltip="Select block type">
          {selectedItem && <selectedItem.icon />}
          <ChevronDown size={16} />
        </Components.FormattingToolbar.Button>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown data-radix-popper-content-wrapper className="bn-shadcn bn-menu-dropdown">
        {fullItems.map(({ title, icon, isSelected, onClick }) => (
          <Components.Generic.Menu.Item className="bn-menu-item" key={title} onClick={onClick} icon={icon} checked={isSelected}>
            {title}
          </Components.Generic.Menu.Item>
        ))}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
};
