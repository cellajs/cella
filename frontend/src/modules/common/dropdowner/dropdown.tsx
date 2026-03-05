import { useEffect, useRef } from 'react';
import { type InternalDropdown, useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { DropdownMenu, DropdownMenuContent } from '~/modules/ui/dropdown-menu';

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

  const onOpenChange = (nextOpen: boolean, eventDetails: { reason: string }) => {
    if (!nextOpen && eventDetails.reason === 'escape-key') {
      useDropdowner.getState().remove();
      return;
    }
    if (!nextOpen && eventDetails.reason === 'outside-press') {
      useDropdowner.getState().remove();
      return;
    }
    if (!nextOpen) useDropdowner.getState().remove();
  };

  return (
    <DropdownMenu key={dropdown.key} open={true} onOpenChange={onOpenChange} modal={dropdown.modal}>
      <DropdownMenuContent anchor={triggerEl} align={dropdown.align} className="z-301" finalFocus={triggerFocusRef}>
        {dropdown.content}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
