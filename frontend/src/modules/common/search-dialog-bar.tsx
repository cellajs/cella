import type { ReactNode } from 'react';
import { SearchCloseButton } from '~/modules/common/search-clear-button';
import { DialogClose } from '~/modules/ui/dialog';
import { tw } from '~/utils/tw';

/** A search dialog's layout below `sm`: the dialog's full screen, with the results scrolling under a field that stays at its top edge. */
export const searchDialogLayout = {
  className: tw(
    'max-sm:data-closed:slide-out-to-top-2 max-sm:data-open:slide-in-from-top-2 max-sm:flex max-sm:flex-col max-sm:overflow-hidden max-sm:pt-[env(safe-area-inset-top)]',
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
 * tap ends the search and its keyboard.
 */
export function SearchDialogBar({ children }: SearchDialogBarProps) {
  return (
    <div data-slot="search-dialog-bar" className="flex shrink-0 items-center border-b">
      {children}
      {/* border-l parts the close from the field's own clear X */}
      <div className="flex h-12 shrink-0 items-center border-l px-1.5 sm:hidden">
        <DialogClose render={<SearchCloseButton />} />
      </div>
    </div>
  );
}
