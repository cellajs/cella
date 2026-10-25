import { useRef } from 'react';
import { useEventListener } from '~/hooks/use-event-listener';
import { DropdownerContent, useDropdownerSurface } from '~/modules/common/dropdowner/surface';
import { type MorphAnchor, type MorphTiming, useSwapMorph } from '~/modules/common/dropdowner/swap-morph';
import { dropdowner, type InternalDropdown } from '~/modules/common/dropdowner/use-dropdowner';
import { Drawer, DrawerContent, DrawerRowGroup, DrawerTitle, DrawerVirtualKeyboardProvider } from '~/modules/ui/drawer';

/** Whether this content renders in the mobile drawer, where actions are action-sheet rows (`Button variant="row"`). */
export const useInDropdownerDrawer = () => useDropdownerSurface() === 'drawer';

// The rows stay at the bottom while the sheet's top edge glides, so what the finger just pressed is replaced in place
const drawerAnchor: MorphAnchor = { x: 'stretch', y: 'bottom' };
const drawerMorph: MorphTiming = { duration: 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };

interface DropdownerDrawerProps {
  dropdown: InternalDropdown;
}

export function DropdownerDrawer({ dropdown }: DropdownerDrawerProps) {
  const { id, content, triggerLabel, kind } = dropdown;
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useSwapMorph({ dropdownKey: dropdown.key, content, containerRef, contentRef, anchor: () => drawerAnchor, timing: drawerMorph });

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
          <DropdownerContent dropdown={dropdown} surface="drawer">
            <div ref={containerRef}>
              {/* A menu's items are one group of rows; a panel (a form) lays out its own. */}
              <div ref={contentRef} className="flex flex-col gap-2 p-4 pb-[calc(1rem+var(--bottom-inset))]">
                {kind === 'menu' ? <DrawerRowGroup>{content}</DrawerRowGroup> : content}
              </div>
            </div>
          </DropdownerContent>
        </DrawerContent>
      </DrawerVirtualKeyboardProvider>
    </Drawer>
  );
}
