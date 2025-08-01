import type { Block, BlockConfig, InlineContentSchema, StyleSchema } from '@blocknote/core';
import { type BlockTypeSelectItem, type DragHandleMenuProps, useComponentsContext, useDictionary } from '@blocknote/react';
import { useMemo } from 'react';
import { customBlockTypeSelectItems, getSideMenuItems } from '~/modules/common/blocknote/blocknote-config';
import { focusEditor } from '~/modules/common/blocknote/helpers/focus';
import type { CommonBlockNoteProps, CustomBlockNoteEditor, CustomBlockTypes } from '~/modules/common/blocknote/types';

interface ResetBlockTypeItemProp {
  editor: CustomBlockNoteEditor;
  props: DragHandleMenuProps;
  allowedTypes: CustomBlockTypes[];
  headingLevels: NonNullable<CommonBlockNoteProps['headingLevels']>;
}

export function ResetBlockTypeItem({ editor, props: { block }, allowedTypes, headingLevels }: ResetBlockTypeItemProp) {
  // biome-ignore lint/style/noNonNullAssertion: required by author
  const Components = useComponentsContext()!;
  const dict = useDictionary();

  const filteredSelectItems = customBlockTypeSelectItems.filter((i) => allowedTypes.includes(i));
  const selectItemsType: readonly string[] = filteredSelectItems;

  const filteredItems = useMemo(() => {
    return getSideMenuItems(dict).filter((item) => {
      if (!selectItemsType.includes(item.type)) return false;

      if (item.type === 'heading' && typeof item.props?.level === 'number') {
        return headingLevels.includes(item.props.level as (typeof headingLevels)[number]);
      }
      return true;
    });
  }, [editor, dict, selectItemsType, headingLevels]);

  // Determine if the current block type should be shown
  const shouldShow = useMemo(() => filteredItems.some((item) => item.type === block.type), [block.type, filteredItems]);

  // Handle item click for updating the block type
  const handleItemClick = (item: BlockTypeSelectItem & { oneInstanceOnly?: boolean }) => {
    if (item.oneInstanceOnly) {
      const existingBlock = editor.document.find((block) => block.type === item.type);
      if (existingBlock) editor.updateBlock(existingBlock, { type: 'paragraph' });
    }

    // Update the selected block
    editor.updateBlock(block, {
      type: item.type as Exclude<CustomBlockTypes, 'emoji'>,
      props: item.props, // Pass props (to get heading level: 1 | 2 | 3)
    });
    // to reset editor focus so side menu open state does not block the on blur update
    setTimeout(() => focusEditor(editor, block.id), 0);
  };

  const fullItems = useMemo(
    () =>
      filteredItems.map((item) => {
        const { type, icon: Icon, isSelected, name } = item;
        return {
          type: type,
          title: name,
          icon: <Icon size={16} />,
          onClick: () => handleItemClick(item),
          isSelected: isSelected(block as unknown as Block<Record<string, BlockConfig>, InlineContentSchema, StyleSchema>),
        };
      }),
    [block, filteredItems, editor],
  );
  // If block type should not be shown or the editor is not editable, return null early
  if (!shouldShow || !editor.isEditable) return null;

  return (
    <>
      {fullItems.map(({ title, type, icon, onClick }) => {
        const isSelected = block.type === 'heading' ? title.includes(block.props.level.toString()) : block.type === type;
        return (
          <Components.Generic.Menu.Item className="bn-menu-item" key={title} onClick={onClick} icon={icon} checked={isSelected}>
            {title}
          </Components.Generic.Menu.Item>
        );
      })}
    </>
  );
}
