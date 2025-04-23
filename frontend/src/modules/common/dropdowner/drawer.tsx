import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { type InternalDropdown, useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';

export default function DropdownDrawer({ dropdown }: { dropdown: InternalDropdown }) {
  const { id, content } = dropdown;

  const closeDialog = () => {
    useDropdowner.getState().remove();
  };

  const onOpenChange = (open: boolean) => {
    if (!open) closeDialog();
  };

  return (
    <Drawer key={id} open={true} onOpenChange={onOpenChange} onClose={closeDialog} noBodyStyles>
      <DrawerContent id={String(id)} onEscapeKeyDown={closeDialog} className="z-301" isDropdown>
        <DrawerHeader className="p-0">
          <VisuallyHidden>
            <DrawerTitle>Choose</DrawerTitle>
            <DrawerDescription>Select an option</DrawerDescription>
          </VisuallyHidden>
        </DrawerHeader>
        <div className="flex flex-col gap-4 p-4">{content}</div>
      </DrawerContent>
    </Drawer>
  );
}
