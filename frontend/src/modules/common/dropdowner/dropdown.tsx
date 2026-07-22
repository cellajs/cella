import { Menu } from '@base-ui/react/menu';
import { useEffect, useLayoutEffect } from 'react';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { type InternalDropdown, useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { FocusTrap } from '~/modules/common/focus-trap';
import { Popover, PopoverContent } from '~/modules/ui/popover';

export const DropdownerDropdown = ({ dropdown }: { dropdown: InternalDropdown }) => {
  const triggerEl = dropdown.triggerRef?.current;

  // Portaled content may autofocus before positioning and scroll the document.
  // Restore the pre-mount scroll position on the next frame.
  useLayoutEffect(() => {
    const scroller = document.scrollingElement ?? document.documentElement;
    const { scrollTop, scrollLeft } = scroller;
    const raf = requestAnimationFrame(() => {
      scroller.scrollTo({ top: scrollTop, left: scrollLeft, behavior: 'instant' as ScrollBehavior });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Watch for trigger removal from DOM
  useEffect(() => {
    if (!triggerEl) return;

    const observer = new MutationObserver(() => {
      if (!document.body.contains(triggerEl)) {
        useDropdowner.getState().remove();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [triggerEl]);

  if (!triggerEl) return null;

  if (dropdown.kind === 'menu') return <MenuDropdown dropdown={dropdown} triggerEl={triggerEl} />;
  return <PanelDropdown dropdown={dropdown} triggerEl={triggerEl} />;
};

const MenuDropdown = ({ dropdown, triggerEl }: { dropdown: InternalDropdown; triggerEl: HTMLElement }) => {
  const triggerFocusRef = useLatestRef(triggerEl);

  const onOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) useDropdowner.getState().remove();
  };

  return (
    <Menu.Root key={dropdown.key} open={true} onOpenChange={onOpenChange} modal={false}>
      <Menu.Portal>
        <Menu.Positioner anchor={triggerEl} align={dropdown.align} sideOffset={4} className="z-301">
          <Menu.Popup
            className="min-w-32 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-hidden"
            finalFocus={triggerFocusRef}
          >
            {dropdown.content}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};

const PanelDropdown = ({ dropdown, triggerEl }: { dropdown: InternalDropdown; triggerEl: HTMLElement }) => {
  const triggerFocusRef = useLatestRef(triggerEl);

  const onOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) useDropdowner.getState().remove();
  };

  return (
    <Popover key={dropdown.key} open={true} onOpenChange={onOpenChange} modal={false}>
      <PopoverContent anchor={triggerEl} align={dropdown.align} className="z-301 p-0" finalFocus={triggerFocusRef}>
        <FocusTrap active initialFocus returnFocus containFocus>
          <div style={{ display: 'contents' }}>{dropdown.content}</div>
        </FocusTrap>
      </PopoverContent>
    </Popover>
  );
};
