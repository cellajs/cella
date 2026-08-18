import { SideMenuExtension } from '@blocknote/core/extensions';
import type { BlockTypeSelectItem } from '@blocknote/react';
import { useComponentsContext, useDictionary, useExtension, useExtensionState } from '@blocknote/react';
import { customBlockTypeSwitchItems, getSideMenuItems } from '~/modules/common/blocknote/blocknote-config';
import { focusEditor } from '~/modules/common/blocknote/helpers/focus';
import { isHeadingMenuItemActive } from '~/modules/common/blocknote/helpers/header-item-select';
import type {
  CommonBlockNoteProps,
  CustomBlockNoteEditor,
  CustomBlockTypes,
  TitleLevel,
} from '~/modules/common/blocknote/types';

interface ResetBlockTypeItemProp {
  editor: CustomBlockNoteEditor;
  allowedTypes: CustomBlockTypes[];
  headingLevels: NonNullable<CommonBlockNoteProps['headingLevels']>;
  /** Forced-title mode: body blocks must not rank at or above the title. */
  titleLevel?: TitleLevel;
}

export function ResetBlockTypeItem({ editor, allowedTypes, headingLevels, titleLevel }: ResetBlockTypeItemProp) {
  const Components = useComponentsContext()!;
  const dict = useDictionary();

  const sideMenu = useExtension(SideMenuExtension);
  const block = useExtensionState(SideMenuExtension, { selector: (state) => state?.block });

  if (block === undefined) return null;

  const filteredSelectItems = customBlockTypeSwitchItems.filter((i) => allowedTypes.includes(i));
  const selectItemsType: readonly string[] = filteredSelectItems;

  const filteredItems = getSideMenuItems(dict).filter((item) => {
    if (!selectItemsType.includes(item.type)) return false;

    if (item.type === 'heading') {
      if (item.props?.isToggleable) return false;
      if (typeof item.props?.level === 'number') {
        if (titleLevel !== undefined && item.props.level <= titleLevel) return false;
        return headingLevels.includes(item.props.level as (typeof headingLevels)[number]);
      }
    }
    return true;
  });

  const shouldShow = filteredItems.some((item) => item.type === block.type);

  const handleItemClick = (item: BlockTypeSelectItem & { oneInstanceOnly?: boolean }) => {
    if (item.oneInstanceOnly) {
      const existingBlock = editor.document.find((block) => block.type === item.type);
      if (existingBlock) editor.updateBlock(existingBlock, { type: 'paragraph' });
    }

    editor.updateBlock(block, {
      type: item.type as Exclude<CustomBlockTypes, 'emoji'>,
      props: item.props,
    });
    // Refocus the editor so the open side menu does not block the blur update.
    setTimeout(() => focusEditor(editor, block.id), 0);
  };

  const fullItems = filteredItems.map((item) => {
    const { type, icon: Icon, name } = item;
    return {
      type: type,
      title: name,
      icon: <Icon />,
      onClick: () => handleItemClick(item),
    };
  });
  if (!shouldShow || !editor.isEditable) return null;

  return (
    <>
      {fullItems.map(({ title, type, icon, onClick }) => {
        const isSelected = block.type === 'heading' ? isHeadingMenuItemActive(block, title) : block.type === type;

        return (
          <Components.Generic.Menu.Item
            className="bn-menu-item"
            key={title}
            onClick={() => {
              onClick();
              sideMenu.unfreezeMenu();
            }}
            icon={icon}
            checked={isSelected}
          >
            {title}
          </Components.Generic.Menu.Item>
        );
      })}
    </>
  );
}
