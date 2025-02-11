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
  hasDropDown?: boolean;
  position?: 'left' | 'right' | 'top' | 'bottom';
};

export const CustomDragHandleButton = <
  BSchema extends BlockSchema = DefaultBlockSchema,
  I extends InlineContentSchema = DefaultInlineContentSchema,
  S extends StyleSchema = DefaultStyleSchema,
>({
  hasDropDown = false,
  position = 'top',
  dragHandleMenu: DragHandleContent = DragHandleMenu,
  blockDragStart,
  blockDragEnd,
  freezeMenu,
  unfreezeMenu,
  block,
}: CustomDragHandleButtonProps<BSchema, I, S>) => {
  // biome-ignore lint/style/noNonNullAssertion: req by author
  const Components = useComponentsContext()!;

  // Wrapper to match the signature of onDragStart
  const handleDragStart = ({ dataTransfer, clientY }: React.DragEvent) => {
    blockDragStart?.({ dataTransfer, clientY }, block);
  };

  // Prevent form submission when clicking the drag handle button
  const handleButtonClick = (e: React.MouseEvent) => e.preventDefault();

  // Common button properties
  const baseButtonProps = {
    onDragStart: handleDragStart,
    onDragEnd: blockDragEnd,
    className: 'bn-button',
    icon: <GripVertical size={22} data-test="dragHandle" />,
  };

  return (
    <Components.Generic.Menu.Root onOpenChange={(open: boolean) => (open ? freezeMenu() : unfreezeMenu())} position={position}>
      {hasDropDown ? (
        <Components.Generic.Menu.Trigger>
          <Components.SideMenu.Button {...baseButtonProps} label="Open side menu" draggable />
        </Components.Generic.Menu.Trigger>
      ) : (
        <Components.SideMenu.Button {...baseButtonProps} onClick={handleButtonClick} label="Drag button" draggable />
      )}

      <DragHandleContent block={block} />
    </Components.Generic.Menu.Root>
  );
};
