import { SquareXIcon } from 'lucide-react';
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
  /** Number of selected items; shown as a badge on the bar's edge, the bar is hidden while zero. */
  count: number;
  /** Clears the selection; the bar's own clear button and Escape call it. */
  onClear: () => void;
  /** Bulk action buttons acting on the selection. */
  children: ReactNode;
}

/**
 * Floating action bar for the current selection, at the bottom of the viewport, or of the sheet it renders in. Portaled to
 * body (or the sheet's layer, `sheetLayerOf`) so sticky or transformed ancestors cannot trap it. While visible on the page
 * it sets the `selection-active` body class, which moves FABs and the mobile bottom nav out of its way. A confirmation
 * opened from it docks in its place (`openDeleteDialog`), and the bar steps down meanwhile.
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
                'inset-x-0 bottom-4 z-108 mx-auto flex w-fit items-center gap-2 rounded-lg bg-card/50 p-2 shadow-floating backdrop-blur-xs',
                sheetLayer ? 'absolute' : 'fixed',
              )}
            >
              <CountBadge count={count} className="absolute -top-2 -right-2" />

              <div className="flex items-center gap-2">{children}</div>

              <TooltipButton toolTipContent={t('c:clear_selection')} side="top">
                <Button variant="ghost" onClick={clearSelection}>
                  <SquareXIcon />
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
