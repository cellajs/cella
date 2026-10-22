import { ChevronDownIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { FocusTrap } from '~/modules/common/focus-trap';
import { collapseMotion } from '~/modules/navigation/menu-sheet/helpers/collapse-motion';
import { InfoContent } from '~/modules/navigation/menu-sheet/info-section';
import { PreferencesContent } from '~/modules/navigation/menu-sheet/preferences-section';
import { navigationStore, useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';

interface MenuSheetPanelProps {
  id: string;
  label: TKey;
  children: ReactNode;
}

function MenuSheetPanel({ id, label, children }: MenuSheetPanelProps) {
  const { t } = useTranslation();
  const menuSheetPanel = useNavigationStore((state) => state.menuSheetPanel);
  const toggleMenuSheetPanel = useNavigationStore((state) => state.toggleMenuSheetPanel);

  const isOpen = menuSheetPanel === id;

  return (
    <div>
      {/* Borderless in both states: the open variant's border would shift the label by a pixel on toggle. */}
      <Button
        onClick={() => toggleMenuSheetPanel(id)}
        className="w-full justify-between border-0 shadow-none"
        variant={isOpen ? 'secondary' : 'ghost'}
      >
        <span>{t(label)}</span>
        <ChevronDownIcon className={cn('opacity-50 transition-transform duration-200', isOpen && 'rotate-180')} />
      </Button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div key={`panel-${id}`} {...collapseMotion} transition={{ duration: 0.2, ease: 'easeInOut' }} className="overflow-hidden">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Same length as the panel collapse, so the bar and the panel under it arrive together. */
const pinGlideTiming: KeyframeAnimationOptions = { duration: 200, easing: 'ease-in-out' };

/** Sticks to the bottom of the menu sheet and overlays its content while a panel is expanded. */
export function MenuSheetPanels() {
  const menuSheetPanel = useNavigationStore((state) => state.menuSheetPanel);
  const toggleMenuSheetPanel = useNavigationStore((state) => state.toggleMenuSheetPanel);

  const hasOpenPanel = !!menuSheetPanel;

  const barRef = useRef<HTMLDivElement>(null);
  const glideRef = useRef<Animation | null>(null);
  const paintedTop = useRef<number | null>(null);

  // In a menu longer than the screen, the bar's place at its end lies lower than the sheet's bottom edge, where it pins.
  // Pinning and unpinning glide over that distance with a transform, on the compositor. The store
  // write comes before React's commit, so the listener reads where the bar is painted, a running glide included.
  useEffect(
    () =>
      navigationStore.subscribe((state, prev) => {
        if (!state.menuSheetPanel !== !prev.menuSheetPanel) paintedTop.current = barRef.current?.getBoundingClientRect().top ?? null;
      }),
    [],
  );

  useLayoutEffect(() => {
    const bar = barRef.current;
    const from = paintedTop.current;
    paintedTop.current = null;
    if (!bar || from === null) return;

    glideRef.current?.cancel();
    const offset = from - bar.getBoundingClientRect().top;
    glideRef.current = Math.abs(offset) >= 1 ? bar.animate([{ transform: `translateY(${offset}px)` }, { transform: 'none' }], pinGlideTiming) : null;
  }, [hasOpenPanel]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // An open hover card takes the Escape first; the next one closes the panel
      if (e.key === 'Escape' && hasOpenPanel && !isHoverContentOpen()) {
        e.stopPropagation();
        toggleMenuSheetPanel(menuSheetPanel);
      }
    },
    [hasOpenPanel, menuSheetPanel, toggleMenuSheetPanel],
  );

  return (
    <div ref={barRef} className={cn('relative z-20 mt-auto', hasOpenPanel && 'sticky bottom-0')} onKeyDown={onKeyDown}>
      <AnimatePresence>
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
            'flex flex-col gap-1 border-t border-dashed bg-card px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]',
            hasOpenPanel && 'max-h-dvh overflow-y-auto rounded-t-md shadow-lg',
          )}
        >
          <MenuSheetPanel id="preferences" label="c:preferences">
            <PreferencesContent />
          </MenuSheetPanel>
          <MenuSheetPanel id="info" label="c:info">
            <InfoContent />
          </MenuSheetPanel>
        </div>
      </FocusTrap>
    </div>
  );
}
