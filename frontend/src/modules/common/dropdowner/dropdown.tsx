import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { DropdownerContent } from '~/modules/common/dropdowner/surface';
import { type MorphTiming, useSwapMorph } from '~/modules/common/dropdowner/swap-morph';
import { dropdowner, type InternalDropdown, removeIfCurrent } from '~/modules/common/dropdowner/use-dropdowner';
import { FocusTrap } from '~/modules/common/focus-trap';
import { DropdownMenu, DropdownMenuContent } from '~/modules/ui/dropdown-menu';
import { Popover, PopoverContent } from '~/modules/ui/popover';
import { isTouchInteraction } from '~/utils/input-modality';

interface DropdownerDropdownProps {
  dropdown: InternalDropdown;
}

const popupMorph: MorphTiming = { duration: 240, easing: 'cubic-bezier(0.2, 0, 0, 1)' };

export function DropdownerDropdown({ dropdown }: DropdownerDropdownProps) {
  const trigger = dropdown.triggerRef?.current;
  const triggerFocusRef = useLatestRef(trigger ?? null);
  const popupRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useSwapMorph({
    dropdownKey: dropdown.key,
    content: dropdown.content,
    containerRef: popupRef,
    contentRef,
    anchor: () => ({ x: dropdown.align, y: popupRef.current?.getAttribute('data-side') === 'top' ? 'bottom' : 'top' }),
    timing: popupMorph,
    positioned: true,
  });

  // A confirmation opened straight from a button starts on its safe option, after Base UI has focused the menu
  useEffect(() => {
    const frame = requestAnimationFrame(() => contentRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [dropdown.key]);

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
          ref={popupRef}
          anchor={trigger}
          align={dropdown.align}
          positionerClassName="z-301"
          className={dropdown.popupClassName}
          finalFocus={triggerFocusRef}
        >
          <DropdownerContent dropdown={dropdown} surface="menu">
            <div ref={contentRef}>{dropdown.content}</div>
          </DropdownerContent>
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
          <div className="contents">
            <DropdownerContent dropdown={dropdown} surface="panel">
              {dropdown.content}
            </DropdownerContent>
          </div>
        </FocusTrap>
      </PopoverContent>
    </Popover>
  );
}
