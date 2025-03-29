import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { type InternalDropdown, useDropdowner } from './use-dropdowner';

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
      <DrawerContent id={String(id)} onEscapeKeyDown={closeDialog}>
        <DrawerHeader>
          <VisuallyHidden>
            <DrawerTitle>Choose</DrawerTitle>
            <DrawerDescription>Select an option</DrawerDescription>
          </VisuallyHidden>
        </DrawerHeader>
        {content}
      </DrawerContent>
    </Drawer>
  );
}
