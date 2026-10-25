import { SquareXIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useBodyClass } from '~/hooks/use-body-class';
import { CountBadge } from '~/modules/common/count-badge';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';

interface SelectionActionBarProps {
  /** Number of selected items; shown as a badge on the bar's edge, the bar is hidden while zero. */
  count: number;
  /** Clears the selection; the bar's own clear button calls it. */
  onClear: () => void;
  /** Bulk action buttons acting on the selection. */
  children: ReactNode;
}

/**
 * Floating action bar for the current selection, fixed at the bottom of the viewport. Portaled to
 * body so sticky or transformed ancestors cannot trap it. While visible it sets the
 * `selection-active` body class, which moves FABs and the mobile bottom nav out of its way.
 */
export function SelectionActionBar({ count, onClear, children }: SelectionActionBarProps) {
  const { t } = useTranslation();

  useBodyClass({ 'selection-active': count > 0 });

  return createPortal(
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ bounce: 0, duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-x-0 bottom-4 z-110 mx-auto flex w-fit items-center gap-2 rounded-lg bg-card/50 p-2 shadow-lg backdrop-blur-xs"
        >
          <CountBadge count={count} className="absolute -top-2 -right-2" />

          <div className="flex items-center gap-2">{children}</div>

          <TooltipButton toolTipContent={t('c:clear_selection')} side="top">
            <Button variant="ghost" onClick={onClear}>
              <SquareXIcon />
              <span className="max-lg:hidden">{t('c:clear')}</span>
            </Button>
          </TooltipButton>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
