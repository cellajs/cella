import type { Block, BlockConfig, InlineContentSchema, StyleSchema } from '@blocknote/core';
import { type BlockTypeSelectItem, type DragHandleMenuProps, useComponentsContext, useDictionary } from '@blocknote/react';
import { useMemo } from 'react';
import { customBlockTypeSelectItems, getSideMenuItems } from '~/modules/common/blocknote/blocknote-config';
import { focusEditor } from '~/modules/common/blocknote/helpers';
import type { BasicBlockTypes, CellaCustomBlockTypes, CustomBlockNoteSchema } from '../types';

interface ResetBlockTypeItemProp {
  editor: CustomBlockNoteSchema;
  props: DragHandleMenuProps;
  allowedTypes: (CellaCustomBlockTypes | BasicBlockTypes)[];
}
export function ResetBlockTypeItem({ editor, props: { block }, allowedTypes }: ResetBlockTypeItemProp) {
  // biome-ignore lint/style/noNonNullAssertion: required by author
  const Components = useComponentsContext()!;
  const dict = useDictionary();

  const filteredSelectItems = customBlockTypeSelectItems.filter((i) => allowedTypes.includes(i));

  const filteredItems = useMemo(() => {
    return getSideMenuItems(dict).filter((item) => filteredSelectItems.includes(item.type as BasicBlockTypes | CellaCustomBlockTypes));
  }, [editor, dict]);

  const shouldShow: boolean = useMemo(() => filteredItems.find((item) => item.type === block.type) !== undefined, [block.type, filteredItems]);

  const fullItems = useMemo(() => {
    const onClick = (item: BlockTypeSelectItem & { oneInstanceOnly?: boolean }) => {
      if (item.oneInstanceOnly) {
        const blockAlreadyExists = editor.document.find((block) => block.type === item.type);
        // Convert block to a paragraph if it exists
        if (blockAlreadyExists) editor.updateBlock(blockAlreadyExists, { type: 'paragraph' });
      }

      // Update the selected block
      editor.updateBlock(block, {
        type: item.type as Exclude<BasicBlockTypes, 'emoji'> | CellaCustomBlockTypes,
        //In our case we pass props cos by it we get heading level: 1 | 2 | 3
        props: item.props,
      });
      // to reset editor focus so side menu open state does not block the on blur update
      setTimeout(() => focusEditor(editor, block.id), 0);
    };

    return filteredItems.map((item) => {
      const { icon: Icon, isSelected, name } = item;
      return {
        type: item.type,
        title: name,
        icon: <Icon size={16} />,
        onClick: () => onClick(item),
        isSelected: isSelected(block as unknown as Block<Record<string, BlockConfig>, InlineContentSchema, StyleSchema>),
      };
    });
  }, [block, filteredItems, editor]);

  if (!shouldShow || !editor.isEditable) return null;

  return (
    <>
      {fullItems.map((el) => {
        let isSelected = false;
        if (block.type === 'heading') {
          isSelected = el.title.includes(block.props.level.toString());
        } else isSelected = block.type === el.type;
        return (
          <Components.Generic.Menu.Item className="bn-menu-item" key={el.title} onClick={el.onClick} icon={el.icon} checked={isSelected}>
            {el.title}
          </Components.Generic.Menu.Item>
        );
      })}
    </>
  );
}
