import { useEffect, useRef } from 'react';
import { type InternalDropdown, useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { FocusTrap } from '~/modules/common/focus-trap';
import { Popover, PopoverContent } from '~/modules/ui/popover';

export const DropdownerDropdown = ({ dropdown }: { dropdown: InternalDropdown }) => {
  const triggerEl = dropdown.triggerRef?.current;

  const triggerFocusRef = useRef<HTMLElement | null>(null);
  triggerFocusRef.current = triggerEl ?? null;

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
    <Popover key={dropdown.key} open={true} onOpenChange={onOpenChange} modal={dropdown.modal}>
      <PopoverContent anchor={triggerEl} align={dropdown.align} className="z-301 p-0" finalFocus={triggerFocusRef}>
        <FocusTrap active>{dropdown.content}</FocusTrap>
      </PopoverContent>
    </Popover>
  );
};
