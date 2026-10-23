import { createContext, useContext } from 'react';
import { useEventListener } from '~/hooks/use-event-listener';
import { dropdowner, type InternalDropdown } from '~/modules/common/dropdowner/use-dropdowner';
import { Drawer, DrawerContent, DrawerRowGroup, DrawerTitle, DrawerVirtualKeyboardProvider } from '~/modules/ui/drawer';

const InDrawerContext = createContext(false);

/** Whether this content renders in the mobile drawer, where actions are action-sheet rows (`Button variant="row"`). */
export const useInDropdownerDrawer = () => useContext(InDrawerContext);

interface DropdownerDrawerProps {
  dropdown: InternalDropdown;
}

export function DropdownerDrawer({ dropdown }: DropdownerDrawerProps) {
  const { id, content, triggerLabel, kind } = dropdown;

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
          <InDrawerContext.Provider value={true}>
            {/* A menu's items are one group of rows; a panel (a confirmation, a form) lays out its own. Read on every render: openPopConfirm swaps the kind in place. */}
            <div className="flex flex-col gap-2 p-4 pb-[calc(1rem+var(--bottom-inset))]">
              {kind === 'menu' ? <DrawerRowGroup>{content}</DrawerRowGroup> : content}
            </div>
          </InDrawerContext.Provider>
        </DrawerContent>
      </DrawerVirtualKeyboardProvider>
    </Drawer>
  );
}
