import { useEventListener } from '~/hooks/use-event-listener';
import { type InternalDropdown, useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';

export function DropdownerDrawer({ dropdown }: { dropdown: InternalDropdown }) {
  const { id, content } = dropdown;

  const closeDialog = () => {
    useDropdowner.getState().remove();
  };

  const onOpenChange = (open: boolean) => {
    if (!open) closeDialog();
  };

  // Close dropdown drawer when user navigates away
  useEventListener('popstate', closeDialog);

  return (
    <Drawer key={id} open={true} onOpenChange={onOpenChange}>
      <DrawerContent id={String(id)} className="z-301 max-h-[70vh]">
        <DrawerHeader className="p-0">
          <span className="sr-only">
            <DrawerTitle>Choose</DrawerTitle>
            <DrawerDescription>Select an option</DrawerDescription>
          </span>
        </DrawerHeader>
        <div className="flex flex-col gap-4 p-4">{content}</div>
      </DrawerContent>
    </Drawer>
  );
}
