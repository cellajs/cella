import { useEffect, useRef } from 'react';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { type InternalDropdown, useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { useMenuKeyNav } from '~/modules/common/dropdowner/use-menu-key-nav';
import { FocusTrap } from '~/modules/common/focus-trap';
import { Popover, PopoverContent } from '~/modules/ui/popover';

export const DropdownerDropdown = ({ dropdown }: { dropdown: InternalDropdown }) => {
  const triggerEl = dropdown.triggerRef?.current;

  const triggerFocusRef = useLatestRef(triggerEl ?? null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Adds WAI-ARIA menu navigation (arrows, Home/End, typeahead) when content
  // contains [role="menuitem"]. No-op for non-menu popovers (date pickers, etc.).
  useMenuKeyNav(contentRef);

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

  const onOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) useDropdowner.getState().remove();
  };

  return (
    <Popover key={dropdown.key} open={true} onOpenChange={onOpenChange} modal={false}>
      <PopoverContent anchor={triggerEl} align={dropdown.align} className="z-301 p-0" finalFocus={triggerFocusRef}>
        <FocusTrap active initialFocus returnFocus containFocus>
          <div ref={contentRef} style={{ display: 'contents' }}>
            {dropdown.content}
          </div>
        </FocusTrap>
      </PopoverContent>
    </Popover>
  );
};
