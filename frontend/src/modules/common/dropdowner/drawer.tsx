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

  useEventListener('popstate', closeDialog);

  return (
    <Drawer key={id} open={true} onOpenChange={onOpenChange}>
      <DrawerContent id={String(id)} className="max-h-[70dvh]">
        <DrawerHeader data-overlay="dropdown" className="p-0">
          <span className="sr-only">
            <DrawerTitle>Choose</DrawerTitle>
            <DrawerDescription>Select an option</DrawerDescription>
          </span>
        </DrawerHeader>
        <div className="flex flex-col gap-2 p-4">{content}</div>
      </DrawerContent>
    </Drawer>
  );
}
