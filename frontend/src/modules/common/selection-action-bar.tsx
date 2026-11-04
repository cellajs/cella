import { XIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useBodyClass } from '~/hooks/use-body-class';
import { useEventListener } from '~/hooks/use-event-listener';
import { shouldFireEvent } from '~/hooks/use-hotkeys-helpers';
import { announce } from '~/modules/common/announce';
import { CountBadge } from '~/modules/common/count-badge';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { sheetLayerOf } from '~/modules/common/sheeter/sheet-layer';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';

interface SelectionActionBarProps {
  /** The bar hides while zero. */
  count: number;
  /** Called by the clear button and Escape. */
  onClear: () => void;
  children: ReactNode;
}

/**
 * Floating action bar for the current selection, portaled to body or the sheet's layer so sticky or transformed ancestors
 * cannot trap it. On the page it sets the `selection-active` body class, which moves FABs and the bottom nav out of its
 * way; a confirmation opened from it docks in its place (`openDeleteDialog`).
 */
export function SelectionActionBar({ count, onClear, children }: SelectionActionBarProps) {
  const { t } = useTranslation();
  const confirming = useDialoger((state) => state.dialogs.some((dialog) => dialog.dock && dialog.open));

  const anchorRef = useRef<HTMLSpanElement>(null);
  const [sheetLayer, setSheetLayer] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setSheetLayer(sheetLayerOf(anchorRef.current)), []);

  useBodyClass({ 'selection-active': count > 0 && !sheetLayer });

  const clearSelection = () => {
    onClear();
    if (anchorRef.current) announce(anchorRef.current, t('c:success.clear_selection'));
  };

  // Escape clears too, unless something layered above, the confirmation or a field being edited takes it
  useEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || confirming || isHoverContentOpen()) return;
      if (shouldFireEvent(event, ['INPUT', 'TEXTAREA', 'SELECT'])) clearSelection();
    },
    { enabled: count > 0 },
  );

  return (
    <>
      <span ref={anchorRef} hidden />
      {createPortal(
        <AnimatePresence>
          {count > 0 && (
            <motion.div
              data-selection-bar
              initial={{ opacity: 0, y: 16 }}
              animate={confirming ? { opacity: 0, y: 16 } : { opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ bounce: 0, duration: 0.2, ease: 'easeOut' }}
              // z-108 keeps it under the spotlight's dim (110), with the rest of the page
              className={cn(
                'text-editing:invisible bg-background shadow-floating inset-x-0 bottom-4 z-108 mx-auto flex w-fit items-center gap-2 rounded-lg p-2',
                sheetLayer ? 'absolute' : 'fixed',
              )}
            >
              <CountBadge count={count} className="absolute -top-2 -right-2" />

              <div className="flex items-center gap-2">{children}</div>

              <TooltipButton toolTipContent={t('c:clear_selection')} side="top">
                <Button variant="ghost" onClick={clearSelection}>
                  <XIcon />
                  <span className="max-lg:hidden">{t('c:clear')}</span>
                </Button>
              </TooltipButton>
            </motion.div>
          )}
        </AnimatePresence>,
        sheetLayer ?? document.body,
      )}
    </>
  );
}
