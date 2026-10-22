import { useEventListener } from '~/hooks/use-event-listener';
import { dropdowner, type InternalDropdown } from '~/modules/common/dropdowner/use-dropdowner';
import { Drawer, DrawerContent, DrawerTitle, DrawerVirtualKeyboardProvider } from '~/modules/ui/drawer';

interface DropdownerDrawerProps {
  dropdown: InternalDropdown;
}

export function DropdownerDrawer({ dropdown }: DropdownerDrawerProps) {
  const { id, content, triggerLabel } = dropdown;

  const closeDropdown = () => {
    dropdowner.getState().remove();
  };

  useEventListener('popstate', closeDropdown);

  return (
    <Drawer key={id} open onOpenChange={closeDropdown}>
      <DrawerVirtualKeyboardProvider>
        {/* While typing, the sheet fills the space above the keyboard: sized by a filtering list, it would shrink and move its search field. */}
        <DrawerContent id={String(id)} data-overlay="dropdown" className="max-h-[70dvh] group-[.keyboard-open]/body:h-[calc(100%-1.25rem)]">
          {triggerLabel && <DrawerTitle className="sr-only">{triggerLabel}</DrawerTitle>}
          <div className="flex flex-col gap-2 p-4">{content}</div>
        </DrawerContent>
      </DrawerVirtualKeyboardProvider>
    </Drawer>
  );
}
