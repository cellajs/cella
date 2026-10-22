import { useEffect, useLayoutEffect } from 'react';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { dropdowner, type InternalDropdown } from '~/modules/common/dropdowner/use-dropdowner';
import { FocusTrap } from '~/modules/common/focus-trap';
import { DropdownMenu, DropdownMenuContent } from '~/modules/ui/dropdown-menu';
import { Popover, PopoverContent } from '~/modules/ui/popover';
import { isTouchInteraction } from '~/utils/input-modality';

/** Closes the dropdown unless it was already swapped for another (e.g. a menu item opening a confirmation panel). */
function removeIfCurrent(key: number) {
  if (dropdowner.getState().dropdown?.key === key) dropdowner.getState().remove();
}

interface DropdownerDropdownProps {
  dropdown: InternalDropdown;
}

export function DropdownerDropdown({ dropdown }: DropdownerDropdownProps) {
  const trigger = dropdown.triggerRef?.current;
  const triggerFocusRef = useLatestRef(trigger ?? null);

  // Portaled content can jump the document scroll to the top while the popup still sits at
  // (0,0), across several async frames. Pin the pre-open scroll position and snap back on any
  // programmatic scroll until a wheel/touch/key scroll releases the pin.
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
        scroller.scrollTo({ top: pinned.top, left: pinned.left, behavior: 'instant' });
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

  useEffect(() => {
    if (!trigger) return;

    const observer = new MutationObserver(() => {
      if (!document.body.contains(trigger)) {
        dropdowner.getState().remove();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [trigger]);

  if (!trigger) return null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) removeIfCurrent(dropdown.key);
  };

  if (dropdown.kind === 'menu') {
    return (
      <DropdownMenu key={dropdown.key} open onOpenChange={handleOpenChange} modal={false}>
        <DropdownMenuContent
          anchor={trigger}
          align={dropdown.align}
          positionerClassName="z-301"
          className={dropdown.popupClassName}
          finalFocus={triggerFocusRef}
        >
          {dropdown.content}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Popover key={dropdown.key} open onOpenChange={handleOpenChange} modal={false}>
      <PopoverContent
        anchor={trigger}
        align={dropdown.align}
        positionerClassName="z-301"
        className="p-0"
        // After touch the focus trap places the initial focus: opened from code, Base UI cannot see a touch open and would focus a text field.
        initialFocus={() => !isTouchInteraction()}
        finalFocus={triggerFocusRef}
        aria-label={dropdown.triggerLabel}
      >
        <FocusTrap active initialFocus returnFocus containFocus>
          <div className="contents">{dropdown.content}</div>
        </FocusTrap>
      </PopoverContent>
    </Popover>
  );
}
