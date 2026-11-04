import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchCloseButton } from '~/modules/common/search-clear-button';
import { DialogClose } from '~/modules/ui/dialog';
import { cn } from '~/utils/cn';
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
  /** Typed text, or chips in a field with chips. */
  hasSearch: boolean;
  onClear: () => void;
}

/**
 * The top bar of a search dialog: the field and one X at its end. With a search the X clears it; with an empty field it
 * closes the dialog, so a second press in the same place ends the search and its keyboard.
 */
export function SearchDialogBar({ children, hasSearch, onClear }: SearchDialogBarProps) {
  const { t } = useTranslation();

  return (
    <div data-slot="search-dialog-bar" className="flex shrink-0 items-center border-b">
      {children}
      <div className="flex h-12 shrink-0 items-center px-1.5">
        <DialogClose
          render={
            <SearchCloseButton aria-label={hasSearch ? t('c:clear_search') : t('c:close')} className={cn(hasSearch && 'text-muted-foreground')} />
          }
          // A press that clears leaves focus in the field, for the next words
          onMouseDown={(event) => {
            if (hasSearch) event.preventDefault();
          }}
          onClick={(event) => {
            if (!hasSearch) return;
            event.preventBaseUIHandler();
            onClear();
          }}
        />
      </div>
    </div>
  );
}
