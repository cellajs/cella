import type {
  BlockSchema,
  DefaultBlockSchema,
  DefaultInlineContentSchema,
  DefaultStyleSchema,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core';
import { DragHandleMenu, type SideMenuProps, useComponentsContext } from '@blocknote/react';
import { GripVertical } from 'lucide-react';

type CustomDragHandleButtonProps<
  BSchema extends BlockSchema = DefaultBlockSchema,
  I extends InlineContentSchema = DefaultInlineContentSchema,
  S extends StyleSchema = DefaultStyleSchema,
> = Omit<SideMenuProps<BSchema, I, S>, 'addBlock'> & {
  haveDropDown?: boolean;
  position?: 'left' | 'right' | 'top' | 'bottom';
};
export const CustomDragHandleButton = <
  BSchema extends BlockSchema = DefaultBlockSchema,
  I extends InlineContentSchema = DefaultInlineContentSchema,
  S extends StyleSchema = DefaultStyleSchema,
>(
  props: CustomDragHandleButtonProps<BSchema, I, S>,
) => {
  // biome-ignore lint/style/noNonNullAssertion: req by author
  const Components = useComponentsContext()!;

  const Content = props.dragHandleMenu || DragHandleMenu;

  // Wrapper to match the signature of onDragStart
  const handleDragStart = (e: React.DragEvent<Element>) => {
    if (props.blockDragStart) {
      const eventData = {
        dataTransfer: e.dataTransfer,
        clientY: e.clientY,
      };
      props.blockDragStart(eventData, props.block);
    }
  };

  // Prevent form submission when clicking the drag handle button
  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <Components.Generic.Menu.Root
      onOpenChange={(open: boolean) => {
        if (open) props.freezeMenu();
        else props.unfreezeMenu();
      }}
      position={props.position}
    >
      {props.haveDropDown ? (
        <Components.Generic.Menu.Trigger>
          <Components.SideMenu.Button
            label="Open side menu"
            draggable={true}
            onDragStart={handleDragStart}
            onDragEnd={props.blockDragEnd}
            className={'bn-button'}
            icon={<GripVertical size={22} data-test="dragHandle" />}
          />
        </Components.Generic.Menu.Trigger>
      ) : (
        <Components.SideMenu.Button
          onClick={handleButtonClick}
          label="Drag button"
          draggable={true}
          onDragStart={handleDragStart}
          onDragEnd={props.blockDragEnd}
          className={'bn-button'}
          icon={<GripVertical size={22} data-test="dragHandle" />}
        />
      )}

      <Content block={props.block} />
    </Components.Generic.Menu.Root>
  );
};
