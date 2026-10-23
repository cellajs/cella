import { type ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { DialogClose } from '~/modules/ui/dialog';

interface SearchDialogBarProps {
  /** The search field. */
  children: ReactNode;
}

/**
 * The top bar of a search dialog (dialoger `searchLayout`): the field, and below `sm` a Cancel beside it, as iOS
 * places it. It also writes the visual viewport's height on the dialog popup, so the dialog ends at the keyboard's
 * edge; kept off :root, a keyboard opening restyles only that subtree.
 */
export function SearchDialogBar({ children }: SearchDialogBarProps) {
  const { t } = useTranslation();
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
      <DialogClose render={<Button variant="ghost" className="h-12 shrink-0 rounded-none px-3 font-normal sm:hidden" />}>{t('c:cancel')}</DialogClose>
    </div>
  );
}
