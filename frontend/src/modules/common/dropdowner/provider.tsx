import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react';
import { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { DropdownMenu, DropdownMenuContent } from '~/modules/ui/dropdown-menu';

export function Dropdowner() {
  const dropdown = useDropdowner((state) => state.dropdown);
  const triggerEl = dropdown?.triggerRef?.current;

  const { refs, floatingStyles, update } = useFloating({
    placement: dropdown?.align === 'start' ? 'bottom-start' : 'bottom-end',
    middleware: [offset(4), flip(), shift()],
    whileElementsMounted(reference, floating, update) {
      if (!reference || !floating) return () => {};

      const cleanup = autoUpdate(reference, floating, update);

      // Close if trigger is removed from DOM
      const observer = new MutationObserver(() => {
        if (reference instanceof Element && !document.body.contains(reference)) {
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
    if (!dropdown || !triggerEl) return;

    refs.setReference(triggerEl);
    update();

    return () => {
      refs.setReference(null);
    };
  }, [dropdown?.key, triggerEl, refs, update]);

  if (!dropdown || !triggerEl) return null;

  return createPortal(
    <DropdownMenu key={dropdown.key} open={true} modal={false}>
      <DropdownMenuContent
        ref={refs.setFloating}
        style={floatingStyles}
        align={dropdown.align ?? 'start'}
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
}
