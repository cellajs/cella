import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FocusTrap } from '~/modules/common/focus-trap';
import { PreferencesContent } from '~/modules/navigation/menu-sheet/preferences-section';
import { SupportContent } from '~/modules/navigation/menu-sheet/support-section';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface MenuSheetPanelProps {
  id: string;
  label: string;
  children: ReactNode;
}

/**
 * Single accordion panel button + expandable content.
 */
const MenuSheetPanel = ({ id, label, children }: MenuSheetPanelProps) => {
  const { t } = useTranslation();
  const menuSheetPanel = useNavigationStore((state) => state.menuSheetPanel);
  const toggleMenuSheetPanel = useNavigationStore((state) => state.toggleMenuSheetPanel);

  const isOpen = menuSheetPanel === id;

  return (
    <div>
      <Button
        onClick={() => toggleMenuSheetPanel(id)}
        className="w-full justify-between shadow-none"
        variant={isOpen ? 'secondary' : 'ghost'}
      >
        <span>{t(label)}</span>
        <ChevronDown size={16} className={cn('opacity-50 transition-transform duration-200', isOpen && 'rotate-180')} />
      </Button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key={`panel-${id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * Bottom panels container for the menu sheet.
 * Sticks to the bottom and overlays content when a panel is expanded.
 */
export const MenuSheetPanels = () => {
  const menuSheetPanel = useNavigationStore((state) => state.menuSheetPanel);
  const toggleMenuSheetPanel = useNavigationStore((state) => state.toggleMenuSheetPanel);

  const hasOpenPanel = !!menuSheetPanel;

  // Stay sticky during exit animation, clear after it completes
  const [isSticky, setIsSticky] = useState(false);
  useEffect(() => {
    if (hasOpenPanel) setIsSticky(true);
  }, [hasOpenPanel]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && hasOpenPanel) {
        e.stopPropagation();
        toggleMenuSheetPanel(menuSheetPanel);
      }
    },
    [hasOpenPanel, menuSheetPanel, toggleMenuSheetPanel],
  );

  return (
    <div className={cn('relative z-20 mt-auto', isSticky && 'sticky bottom-0')} onKeyDown={onKeyDown}>
      {/* Overlay that covers menu content above when a panel is open */}
      <AnimatePresence onExitComplete={() => setIsSticky(false)}>
        {hasOpenPanel && (
          <motion.div
            key="panel-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 bottom-full left-0 z-10 h-[200vh] bg-card/60"
            onClick={() => toggleMenuSheetPanel(menuSheetPanel)}
          />
        )}
      </AnimatePresence>

      <FocusTrap active={hasOpenPanel} disableInactive={false}>
        <div
          className={cn(
            'flex flex-col gap-1 border-t border-dashed bg-card px-3 py-2',
            hasOpenPanel && 'max-h-dvh overflow-y-auto rounded-t-md shadow-lg',
          )}
        >
          <MenuSheetPanel id="preferences" label="c:preferences">
            <PreferencesContent />
          </MenuSheetPanel>
          <MenuSheetPanel id="support" label="c:support">
            <SupportContent />
          </MenuSheetPanel>
        </div>
      </FocusTrap>
    </div>
  );
};
