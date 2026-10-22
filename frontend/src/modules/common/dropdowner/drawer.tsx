import { useEventListener } from '~/hooks/use-event-listener';
import { dropdowner, type InternalDropdown } from '~/modules/common/dropdowner/use-dropdowner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerVirtualKeyboardProvider } from '~/modules/ui/drawer';

export function DropdownerDrawer({ dropdown }: { dropdown: InternalDropdown }) {
  const { id, content, triggerLabel } = dropdown;

  const closeDropdown = () => {
    dropdowner.getState().remove();
  };

  useEventListener('popstate', closeDropdown);

  return (
    <Drawer key={id} open={true} onOpenChange={closeDropdown}>
      <DrawerVirtualKeyboardProvider>
        {/* While typing, the sheet fills the space above the keyboard: sized by a filtering list, it would shrink and move its search field. */}
        <DrawerContent id={String(id)} className="max-h-[70dvh] group-[.keyboard-open]/body:h-[calc(100%-1.25rem)]">
          <DrawerHeader data-overlay="dropdown" className="p-0">
            {triggerLabel && <DrawerTitle className="sr-only">{triggerLabel}</DrawerTitle>}
          </DrawerHeader>
          <div className="flex flex-col gap-2 p-4">{content}</div>
        </DrawerContent>
      </DrawerVirtualKeyboardProvider>
    </Drawer>
  );
}
