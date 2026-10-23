import { SideMenuExtension } from '@blocknote/core/extensions';
import { type BlockTypeSelectItem, useComponentsContext, useExtension } from '@blocknote/react';
import { getBlockTypeItems, isCurrentBlockType } from '~/modules/common/blocknote/blocknote-schema';
import { focusEditor } from '~/modules/common/blocknote/helpers/focus-editor';
import type { CustomBlock, CustomBlockNoteMenuProps } from '~/modules/common/blocknote/types';

interface BlockTypeItemsProps extends CustomBlockNoteMenuProps {
  block: CustomBlock;
}

export function BlockTypeItems({ editor, block, allowedTypes, headingLevels }: BlockTypeItemsProps) {
  const Components = useComponentsContext()!;
  const sideMenu = useExtension(SideMenuExtension);

  const items = getBlockTypeItems(editor, allowedTypes, headingLevels);
  if (!editor.isEditable || !items.some((item) => item.type === block.type)) return null;

  const switchType = (item: BlockTypeSelectItem) => {
    editor.updateBlock(block, { type: item.type as CustomBlock['type'], props: item.props });
    sideMenu.unfreezeMenu();
    // Refocus the editor so the open side menu does not block the blur update.
    setTimeout(() => focusEditor(editor, block.id), 0);
  };

  return items.map((item) => (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      key={item.name}
      onClick={() => switchType(item)}
      icon={<item.icon className="size-4" />}
      checked={isCurrentBlockType(item, block)}
    >
      {item.name}
    </Components.Generic.Menu.Item>
  ));
}
