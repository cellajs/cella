import { CheckIcon, XIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useBodyClass } from '~/hooks/use-body-class';
import { useEventListener } from '~/hooks/use-event-listener';
import { shouldFireEvent } from '~/hooks/use-hotkeys';
import { announce } from '~/modules/common/announce';
import { CountBadge } from '~/modules/common/count-badge';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { sheetLayerOf } from '~/modules/common/sheeter/sheet-layer';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';

/** What an action of the bar just did, shown in place of its actions for a moment, with a way to take it back or retry. */
interface SelectionReceipt {
  /** A new id shows the receipt again, so a repeat of the same action restarts it. */
  id: number;
  text: string;
  failed?: boolean;
  action?: { label: string; onClick: () => void };
}

const receiptHoldMs = 2600;

// The bar rises in from below and sinks back out; a confirmation hides it the same way
const barHidden = { opacity: 0, y: 16 };
const barTransition = { duration: 0.2, ease: 'easeOut' } as const;

interface SelectionActionBarProps {
  /** The bar hides while zero. */
  count: number;
  /** Called by the clear button and Escape. */
  onClear: () => void;
  receipt?: SelectionReceipt | null;
  /** Called once the receipt has held long enough, or its action ran. */
  onReceiptEnd?: () => void;
  children: ReactNode;
}

/**
 * Floating action bar for the current selection, portaled to body or the sheet's layer so sticky or transformed ancestors
 * cannot trap it. On the page it sets the `selection-active` body class, which moves FABs and the bottom nav out of its
 * way; a confirmation opened from it docks in its place (`openDeleteDialog`).
 */
export function SelectionActionBar({ count, onClear, receipt, onReceiptEnd, children }: SelectionActionBarProps) {
  const { t } = useTranslation();
  const confirming = useDialoger((state) => state.dialogs.some((dialog) => dialog.dock && dialog.open));

  const anchorRef = useRef<HTMLSpanElement>(null);
  const [sheetLayer, setSheetLayer] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setSheetLayer(sheetLayerOf(anchorRef.current)), []);

  useBodyClass({ 'selection-active': count > 0 && !sheetLayer });

  // Held while the pointer or keyboard focus is on the receipt, so its action stays within reach. By id: a receipt that
  // unmounts under the pointer never gets its pointerleave.
  const [heldId, setHeldId] = useState<number | null>(null);
  const isHeld = !!receipt && heldId === receipt.id;
  useEffect(() => {
    if (!receipt || isHeld) return;
    const timer = setTimeout(() => onReceiptEnd?.(), receiptHoldMs);
    return () => clearTimeout(timer);
  }, [receipt, isHeld, onReceiptEnd]);

  // Swapping the faces removes the focused button, which drops focus to the page: the face that replaced it takes it.
  // A removed element fires no blur, so the flag still holds then.
  const barRef = useRef<HTMLDivElement>(null);
  const hadFocusRef = useRef(false);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || !hadFocusRef.current || document.activeElement !== document.body) return;
    (bar.querySelector<HTMLElement>('[data-receipt] button') ?? bar.querySelector<HTMLElement>('[data-receipt], button'))?.focus();
  }, [receipt?.id]);

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
              ref={barRef}
              data-selection-bar
              onFocus={() => {
                hadFocusRef.current = true;
              }}
              onBlur={(event) => {
                hadFocusRef.current = !!barRef.current?.contains(event.relatedTarget);
              }}
              initial={barHidden}
              animate={confirming ? barHidden : { opacity: 1, y: 0 }}
              exit={barHidden}
              transition={barTransition}
              // z-108 keeps it under the spotlight's dim (110), with the rest of the page
              className={cn(
                'text-editing:invisible bg-background shadow-floating inset-x-0 bottom-4 z-108 mx-auto flex w-fit items-center gap-2 rounded-lg p-2',
                sheetLayer ? 'absolute' : 'fixed',
              )}
            >
              <CountBadge count={count} className="absolute -top-2 -right-2" />

              {receipt ? (
                <div
                  key={receipt.id}
                  data-receipt
                  role="status"
                  tabIndex={-1}
                  className="animate-in fade-in flex h-10 items-center gap-2 pl-3 text-sm font-medium whitespace-nowrap duration-150 focus-visible:outline-none"
                  onPointerEnter={() => setHeldId(receipt.id)}
                  onPointerLeave={() => setHeldId(null)}
                  onFocus={(event) => event.target.matches(':focus-visible') && setHeldId(receipt.id)}
                  onBlur={() => setHeldId(null)}
                >
                  {receipt.failed ? <XIcon className="text-destructive size-4" /> : <CheckIcon className="text-success size-4" />}
                  {receipt.text}
                  {receipt.action && (
                    <Button
                      variant="ghost"
                      className="ml-1"
                      onClick={() => {
                        receipt.action?.onClick();
                        onReceiptEnd?.();
                      }}
                    >
                      {receipt.action.label}
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">{children}</div>

                  <TooltipButton toolTipContent={t('c:clear_selection')} side="top">
                    <Button variant="ghost" onClick={clearSelection}>
                      <XIcon />
                      <span className="max-lg:hidden">{t('c:clear')}</span>
                    </Button>
                  </TooltipButton>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        sheetLayer ?? document.body,
      )}
    </>
  );
}
