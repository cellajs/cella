import type { Block, BlockConfig, BlockSchema, InlineContentSchema, StyleSchema } from '@blocknote/core';
import {
  type BlockTypeSelectItem,
  type DragHandleMenuProps,
  blockTypeSelectItems,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
} from '@blocknote/react';
import { useMemo } from 'react';
import { customBlockTypeSelectItems } from '~/modules/common/blocknote/blocknote-config';
import type { BlockTypes } from '~/modules/common/blocknote/types';

export function ResetBlockTypeItem(props: DragHandleMenuProps) {
  // biome-ignore lint/style/noNonNullAssertion: required by author
  const Components = useComponentsContext()!;
  const dict = useDictionary();

  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>();

  const filteredItems = useMemo(() => {
    return blockTypeSelectItems(dict).filter((item) => customBlockTypeSelectItems.includes(item.type as BlockTypes));
  }, [editor, dict]);

  const shouldShow: boolean = useMemo(
    () => filteredItems.find((item) => item.type === props.block.type) !== undefined,
    [props.block.type, filteredItems],
  );

  const fullItems = useMemo(() => {
    const onClick = (item: BlockTypeSelectItem) => {
      editor.focus();

      editor.updateBlock(props.block, {
        type: item.type,
        //In our case we pass props cos by it we get heading level: 1 | 2 | 3
        // biome-ignore lint/suspicious/noExplicitAny: required by author
        props: item.props as any,
      });
    };

    return filteredItems.map((item) => {
      const { icon: Icon, isSelected, name } = item;
      return {
        type: item.type,
        title: name,
        icon: <Icon size={16} />,
        onClick: () => onClick(item),
        isSelected: isSelected(props.block as unknown as Block<Record<string, BlockConfig>, InlineContentSchema, StyleSchema>),
      };
    });
  }, [props.block, filteredItems, editor]);

  if (!shouldShow || !editor.isEditable) return null;

  return (
    <>
      {fullItems.map((el) => {
        let isSelected = false;
        if (props.block.type === 'heading') {
          isSelected = el.title.includes(props.block.props.level.toString());
        } else isSelected = props.block.type === el.type;
        return (
          <Components.Generic.Menu.Item className="bn-menu-item" key={el.title} onClick={el.onClick} icon={el.icon} checked={isSelected}>
            {el.title}
          </Components.Generic.Menu.Item>
        );
      })}
    </>
  );
}
