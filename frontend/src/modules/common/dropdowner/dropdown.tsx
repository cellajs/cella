import { Menu } from '@base-ui/react/menu';
import { useEffect, useLayoutEffect } from 'react';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { type InternalDropdown, useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { FocusTrap } from '~/modules/common/focus-trap';
import { Popover, PopoverContent } from '~/modules/ui/popover';
import { cn } from '~/utils/cn';

/** Renders the dropdowner dropdown component. */
export function DropdownerDropdown({ dropdown }: { dropdown: InternalDropdown }) {
  const triggerEl = dropdown.triggerRef?.current;

  // Portaled content (popup positioning, combobox autofocus) can jump the document scroll
  // to the top while the popup is still at (0,0), and this fires across several async frames
  // (positioning, entry animation, data-gated autofocus), not just the first. Pin the
  // pre-open scroll position: snap it back on any programmatic scroll until the user
  // themselves scrolls (wheel/touch/key), which releases the pin.
  useLayoutEffect(() => {
    const scroller = document.scrollingElement ?? document.documentElement;
    const pinned = { top: scroller.scrollTop, left: scroller.scrollLeft };
    let released = false;

    const release = () => {
      if (released) return;
      released = true;
      window.removeEventListener('scroll', onScroll, true);
      for (const type of userScrollEvents) window.removeEventListener(type, release, true);
    };

    const onScroll = () => {
      if (released) return;
      if (scroller.scrollTop !== pinned.top || scroller.scrollLeft !== pinned.left) {
        scroller.scrollTo({ top: pinned.top, left: pinned.left, behavior: 'instant' as ScrollBehavior });
      }
    };

    const userScrollEvents = ['wheel', 'touchmove', 'keydown'] as const;
    window.addEventListener('scroll', onScroll, true);
    for (const type of userScrollEvents) window.addEventListener(type, release, true);
    // Release after positioning + entry animation settle, so later user scrolling is free.
    const timer = setTimeout(release, 400);

    return () => {
      clearTimeout(timer);
      release();
    };
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
}

function MenuDropdown({ dropdown, triggerEl }: { dropdown: InternalDropdown; triggerEl: HTMLElement }) {
  const triggerFocusRef = useLatestRef(triggerEl);

  const onOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) useDropdowner.getState().remove();
  };

  return (
    <Menu.Root key={dropdown.key} open={true} onOpenChange={onOpenChange} modal={false}>
      <Menu.Portal>
        <Menu.Positioner anchor={triggerEl} align={dropdown.align} sideOffset={4} className="z-301">
          <Menu.Popup
            className={cn(
              'min-w-32 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-hidden',
              dropdown.popupClassName,
            )}
            finalFocus={triggerFocusRef}
          >
            {dropdown.content}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function PanelDropdown({ dropdown, triggerEl }: { dropdown: InternalDropdown; triggerEl: HTMLElement }) {
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
}
