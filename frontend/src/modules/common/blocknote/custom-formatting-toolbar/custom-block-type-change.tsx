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
import { ChevronDownIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { customBlockTypeSwitchItems } from '~/modules/common/blocknote/blocknote-config';
import { isHeadingMenuItemActive } from '~/modules/common/blocknote/helpers/header-item-select';
import type { CustomBlock, CustomBlockNoteMenuProps } from '~/modules/common/blocknote/types';

export const CellaCustomBlockTypeSelect = ({ headingLevels }: { headingLevels: CustomBlockNoteMenuProps['headingLevels'] }) => {
  // biome-ignore lint/style/noNonNullAssertion: required by author
  const Components = useComponentsContext()!;
  const dict = useDictionary();
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>();

  const selectedBlocks = useSelectedBlocks(editor);
  const currentBlock = selectedBlocks[0];
  const itemsType: readonly string[] = customBlockTypeSwitchItems;

  const [block, setBlock] = useState(editor.getTextCursorPosition().block);

  const filteredItems = useMemo(
    () =>
      blockTypeSelectItems(dict).filter(({ type, props }) => {
        if (!itemsType.includes(type)) return false;
        if (type === 'heading' && typeof props?.level === 'number') {
          return headingLevels.includes(props.level as (typeof headingLevels)[number]);
        }
        return true;
      }),
    [editor, dict],
  );

  const shouldShow = useMemo(() => filteredItems.some((item) => item.type === block.type), [block.type, filteredItems]);

  const selectedItem = useMemo(() => {
    return filteredItems.find(
      (el) =>
        el.type === currentBlock.type && el.props?.level === currentBlock.props.level && !!el.props?.isToggleable === currentBlock.props.isToggleable,
    );
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
        const { icon: Icon, name, type } = item;
        return {
          title: name,
          icon: <Icon size={16} />,
          onClick: () => handleItemClick(item),
          isSelected: block.type === 'heading' ? isHeadingMenuItemActive(block as unknown as CustomBlock, name) : block.type === type,
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
          <ChevronDownIcon size={16} />
        </Components.FormattingToolbar.Button>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown className="p-2">
        {fullItems.map(({ title, icon, isSelected, onClick }) => (
          <Components.Generic.Menu.Item className="bn-menu-item" key={title} onClick={onClick} icon={icon} checked={isSelected}>
            {title}
          </Components.Generic.Menu.Item>
        ))}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
};
