import { useEventListener } from '~/hooks/use-event-listener';
import { type InternalDropdown, useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';

export function DropdownerDrawer({ dropdown }: { dropdown: InternalDropdown }) {
  const { id, content, triggerLabel } = dropdown;

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
          {triggerLabel && <DrawerTitle className="sr-only">{triggerLabel}</DrawerTitle>}
        </DrawerHeader>
        <div className="flex flex-col gap-2 p-4">{content}</div>
      </DrawerContent>
    </Drawer>
  );
}
