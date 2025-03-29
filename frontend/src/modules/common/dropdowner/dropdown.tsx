import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react';
import { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { type InternalDropdown, useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { DropdownMenu, DropdownMenuContent } from '~/modules/ui/dropdown-menu';

export const DesktopDropdown = ({ dropdown }: { dropdown: InternalDropdown }) => {
  const triggerEl = dropdown.triggerRef?.current;

  // Use floating-ui to position the dropdown, remove it when the trigger is out of DOM
  const { refs, floatingStyles, update } = useFloating({
    placement: dropdown?.align === 'start' ? 'bottom-start' : 'bottom-end',
    middleware: [offset(4), flip(), shift()],
    whileElementsMounted(reference, floating, update) {
      if (!reference || !floating) return () => {};

      const cleanup = autoUpdate(reference, floating, update);

      const observer = new MutationObserver(() => {
        if (reference instanceof Element && !document.body.contains(reference)) {
          useDropdowner.getState().remove();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      return () => {
        cleanup();
        observer.disconnect();
      };
    },
  });

  // Ensure dropdown is removed when trigger is removed
  useLayoutEffect(() => {
    if (!dropdown || !triggerEl) return;
    refs.setReference(triggerEl);
    update();

    return () => {
      refs.setReference(null);
    };
  }, [dropdown?.key, triggerEl, refs, update]);

  if (!triggerEl) return null;

  return createPortal(
    <DropdownMenu key={dropdown.key} open={true} modal={dropdown.modal}>
      <DropdownMenuContent
        ref={refs.setFloating}
        style={floatingStyles}
        align={dropdown.align}
        modal={dropdown.modal}
        onCloseAutoFocus={() => triggerEl?.focus()}
        onEscapeKeyDown={() => useDropdowner.getState().remove()}
        onInteractOutside={(e) => {
          if (!triggerEl.contains(e.target as Node)) {
            useDropdowner.getState().remove();
          }
        }}
      >
        {dropdown.content}
      </DropdownMenuContent>
    </DropdownMenu>,
    document.body,
  );
};
