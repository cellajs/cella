import { type ReactNode, useEffect, useRef } from 'react';
import { SearchCloseButton } from '~/modules/common/search-clear-button';
import { DialogClose } from '~/modules/ui/dialog';
import { tw } from '~/utils/tw';

/** A search dialog's layout below `sm`: the whole screen above the keyboard, with the results scrolling under a field that stays. */
export const searchDialogLayout = {
  // Its height comes from --visual-viewport-height, which `SearchDialogBar` writes
  className: tw(
    'max-sm:data-closed:slide-out-to-top-2 max-sm:data-open:slide-in-from-top-2 max-sm:m-0 max-sm:flex max-sm:h-(--visual-viewport-height,100dvh) max-sm:max-h-none max-sm:w-full max-sm:flex-col max-sm:self-start max-sm:overflow-hidden max-sm:rounded-none max-sm:pt-[env(safe-area-inset-top)] max-sm:shadow-none max-sm:ring-0',
  ),
  // A drag here would scroll the page under it: iOS scroll lock fails once its toolbar has collapsed
  viewportClassName: 'max-sm:touch-none',
  overlayClassName: 'max-sm:hidden',
};

interface SearchDialogBarProps {
  /** The search field. */
  children: ReactNode;
}

/**
 * The top bar of a search dialog: the field, and below `sm` a close X beside it, shown with an empty field too, so one
 * tap ends the search and its keyboard. It also writes the visual viewport's height on the dialog popup, so the dialog
 * ends at the keyboard's edge; kept off :root, a keyboard opening restyles only that subtree.
 */
export function SearchDialogBar({ children }: SearchDialogBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const popup = barRef.current?.closest<HTMLElement>('[data-slot="dialog-content"]');
    if (!viewport || !popup) return;

    const update = () => popup.style.setProperty('--visual-viewport-height', `${viewport.height}px`);
    update();
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, []);

  return (
    <div ref={barRef} data-slot="search-dialog-bar" className="flex shrink-0 items-center border-b">
      {children}
      {/* border-l parts the close from the field's own clear X */}
      <div className="flex h-12 shrink-0 items-center border-l px-1.5 sm:hidden">
        <DialogClose render={<SearchCloseButton />} />
      </div>
    </div>
  );
}
