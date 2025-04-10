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
      <DrawerContent id={String(id)} onEscapeKeyDown={closeDialog} className="py-6 px-4 z-301" isDropdown>
        <DrawerHeader className="p-0">
          <VisuallyHidden>
            <DrawerTitle>Choose</DrawerTitle>
            <DrawerDescription>Select an option</DrawerDescription>
          </VisuallyHidden>
        </DrawerHeader>
        {/* To allow y scroll in drawer */}
        <div className="overflow-y-auto">{content}</div>
      </DrawerContent>
    </Drawer>
  );
}
