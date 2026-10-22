import { SideMenuExtension } from '@blocknote/core/extensions';
import type { BlockTypeSelectItem } from '@blocknote/react';
import { useComponentsContext, useExtension } from '@blocknote/react';
import { getBlockTypeItems, isCurrentBlockType } from '~/modules/common/blocknote/blocknote-schema';
import { focusEditor } from '~/modules/common/blocknote/helpers/focus';
import type { CustomBlock, CustomBlockNoteMenuProps, CustomBlockTypes } from '~/modules/common/blocknote/types';

export function ResetBlockTypeItem({ editor, block, allowedTypes, headingLevels }: CustomBlockNoteMenuProps & { block: CustomBlock }) {
  const Components = useComponentsContext()!;
  const sideMenu = useExtension(SideMenuExtension);

  const items = getBlockTypeItems(editor, allowedTypes, headingLevels);
  if (!editor.isEditable || !items.some((item) => item.type === block.type)) return null;

  const switchType = (item: BlockTypeSelectItem) => {
    editor.updateBlock(block, { type: item.type as Exclude<CustomBlockTypes, 'emoji'>, props: item.props });
    sideMenu.unfreezeMenu();
    // Refocus the editor so the open side menu does not block the blur update.
    setTimeout(() => focusEditor(editor, block.id), 0);
  };

  return items.map((item) => (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      key={item.name}
      onClick={() => switchType(item)}
      icon={<item.icon />}
      checked={isCurrentBlockType(item, block)}
    >
      {item.name}
    </Components.Generic.Menu.Item>
  ));
}
