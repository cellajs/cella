import { SquareXIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useBodyClass } from '~/hooks/use-body-class';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

interface SelectionActionBarProps {
  /** Number of selected items; shown as a badge on the bar's edge, the bar is hidden while zero. */
  count: number;
  /** Clears the selection (wired to the built-in clear button). */
  onClear: () => void;
  /** Bulk action buttons acting on the selection. */
  children: ReactNode;
}

/**
 * Floating action bar for the current row/card selection, fixed at the bottom of the viewport.
 * Shows caller-provided bulk actions and a built-in clear button. Portaled to body so sticky or
 * transformed ancestors cannot trap it. While visible it sets the `selection-active` body class
 * so FABs and the mobile bottom nav animate out of its way.
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
          <Badge className="absolute -top-2 -right-2 flex min-w-5 justify-center px-1 py-0 shadow-sm">{count}</Badge>

          <div className="flex items-center gap-2">{children}</div>

          <TooltipButton toolTipContent={t('c:clear_selection')} side="top">
            <Button variant="ghost" onClick={onClear}>
              <SquareXIcon />
              <span className="ml-1 max-lg:hidden">{t('c:clear')}</span>
            </Button>
          </TooltipButton>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
