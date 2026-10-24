import { type ReactNode, useEffect, useRef } from 'react';
import { SearchCloseButton } from '~/modules/common/search-clear-button';
import { DialogClose } from '~/modules/ui/dialog';

interface SearchDialogBarProps {
  /** The search field. */
  children: ReactNode;
}

/**
 * The top bar of a search dialog (dialoger `searchLayout`): the field, and below `sm` a close X beside it, shown with
 * an empty field too, so one tap ends the search and its keyboard. It also writes the visual viewport's height on the
 * dialog popup, so the dialog ends at the keyboard's edge; kept off :root, a keyboard opening restyles only that subtree.
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
    <div ref={barRef} className="flex shrink-0 items-center border-b">
      {children}
      {/* border-l parts the close from the field's own clear X */}
      <div className="flex h-12 shrink-0 items-center border-l px-1.5 sm:hidden">
        <DialogClose render={<SearchCloseButton />} />
      </div>
    </div>
  );
}
