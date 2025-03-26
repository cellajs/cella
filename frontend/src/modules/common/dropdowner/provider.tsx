import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react';
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { DropdownMenu, DropdownMenuContent } from '~/modules/ui/dropdown-menu';

export function Dropdowner() {
  const dropdown = useDropdowner((state) => state.dropdown);
  const triggerRef = useRef<HTMLElement | null>(null);

  // We use floating-ui to manage the dropdown positioning and also remove it when trigger is not in the DOM
  const { refs, floatingStyles, update } = useFloating({
    placement: dropdown?.align === 'start' ? 'bottom-start' : 'bottom-end',
    middleware: [offset(4), flip(), shift()],
    whileElementsMounted(reference, floating, update) {
      const cleanup = autoUpdate(reference, floating, update);

      // If trigger is removed, close dropdown
      const observer = new MutationObserver(() => {
        if (reference instanceof Node && !document.body.contains(reference)) {
          useDropdowner.getState().remove();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      return () => {
        cleanup();
        observer.disconnect();
      };
    },
  });

  useLayoutEffect(() => {
    if (!dropdown) return;

    const trigger = dropdown.triggerId ? document.getElementById(dropdown.triggerId) : null;
    if (!trigger) return;

    refs.setReference(trigger);
    triggerRef.current = trigger;
    update();

    return () => {
      triggerRef.current = null;
    };
  }, [dropdown?.key, refs, update]);

  if (!dropdown || !triggerRef.current) return null;

  return createPortal(
    <DropdownMenu key={dropdown.key} open={true} modal={false}>
      <DropdownMenuContent
        ref={refs.setFloating}
        style={floatingStyles}
        align={dropdown.align ?? 'start'}
        modal={dropdown.modal}
        onCloseAutoFocus={() => triggerRef.current?.focus()}
        onEscapeKeyDown={() => useDropdowner.getState().remove()}
        onInteractOutside={(e) => {
          if (!triggerRef.current?.contains(e.target as Node)) {
            useDropdowner.getState().remove();
          }
        }}
      >
        {dropdown.content}
      </DropdownMenuContent>
    </DropdownMenu>,
    document.body,
  );
}
