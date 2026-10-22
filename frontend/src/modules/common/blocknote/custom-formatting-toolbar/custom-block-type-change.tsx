import { type BlockTypeSelectItem, useBlockNoteEditor, useComponentsContext, usePortalElement, useSelectedBlocks } from '@blocknote/react';
import { ChevronDownIcon } from 'lucide-react';
import { customSchema, getBlockTypeItems, isCurrentBlockType } from '~/modules/common/blocknote/blocknote-schema';
import type { CustomBlockNoteMenuProps, CustomBlockTypes } from '~/modules/common/blocknote/types';

export function CustomBlockTypeSelect({ allowedTypes, headingLevels }: Omit<CustomBlockNoteMenuProps, 'editor'>) {
  const Components = useComponentsContext()!;
  const portalElement = usePortalElement();
  const editor = useBlockNoteEditor(customSchema);

  const selectedBlocks = useSelectedBlocks(editor);
  const [block] = selectedBlocks;

  const items = getBlockTypeItems(editor, allowedTypes, headingLevels);
  if (!editor.isEditable || !items.some((item) => item.type === block.type)) return null;

  const selectedItem = items.find((item) => isCurrentBlockType(item, block));

  const handleItemClick = (item: BlockTypeSelectItem) => {
    editor.focus();
    for (const selected of selectedBlocks) {
      editor.updateBlock(selected, { type: item.type as Exclude<CustomBlockTypes, 'emoji'>, props: item.props });
    }
  };

  return (
    <Components.Generic.Menu.Root portalElement={portalElement}>
      <Components.Generic.Menu.Trigger>
        <Components.FormattingToolbar.Button className="bn-dropdown-button" label={selectedItem?.name ?? ''} mainTooltip="Select block type">
          {selectedItem && <selectedItem.icon />}
          <ChevronDownIcon />
        </Components.FormattingToolbar.Button>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown className="p-2">
        {items.map((item) => (
          <Components.Generic.Menu.Item
            className="bn-menu-item"
            key={item.name}
            onClick={() => handleItemClick(item)}
            icon={<item.icon />}
            checked={isCurrentBlockType(item, block)}
          >
            {item.name}
          </Components.Generic.Menu.Item>
        ))}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}
