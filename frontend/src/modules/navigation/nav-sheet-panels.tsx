import { ChevronDownIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Activity, type KeyboardEvent, type ReactNode, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { collapseMotion } from '~/modules/common/collapse-motion';
import { FocusTrap } from '~/modules/common/focus-trap';
import { navigationStore, useNavigationStore } from '~/modules/navigation/navigation-store';
import { InfoContent, InfoIndicator } from '~/modules/navigation/panels/info-content';
import { PreferencesContent, PreferencesIndicators } from '~/modules/navigation/panels/preferences-content';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';

interface NavSheetPanelProps {
  id: string;
  label: TKey;
  /** Shown after the label while the panel is closed. */
  indicator?: ReactNode;
  children: ReactNode;
}

/**
 * A panel whose body renders hidden while it is closed, so what the body loads (a lazy tool, a suspense query) is in
 * place before it opens and the collapse animates to the body's full height. A hidden body runs no effects, so it polls nothing.
 */
function NavSheetPanel({ id, label, indicator, children }: NavSheetPanelProps) {
  const { t } = useTranslation();
  const navSheetPanel = useNavigationStore((state) => state.navSheetPanel);
  const toggleNavSheetPanel = useNavigationStore((state) => state.toggleNavSheetPanel);

  const isOpen = navSheetPanel === id;

  // Stays visible until the collapse ends, so the body shows while the panel closes
  const [isBodyVisible, setIsBodyVisible] = useState(isOpen);
  if (isOpen && !isBodyVisible) setIsBodyVisible(true);

  return (
    <div>
      <Button onClick={() => toggleNavSheetPanel(id)} className="w-full justify-between" variant={isOpen ? 'secondary' : 'ghost'}>
        <span className="flex items-center gap-2">
          {t(label)}
          {!isOpen && indicator}
        </span>
        <ChevronDownIcon className={cn('opacity-50 transition-transform duration-200', isOpen && 'rotate-180')} />
      </Button>

      <motion.div
        initial={false}
        animate={isOpen ? collapseMotion.animate : collapseMotion.exit}
        transition={collapseMotion.transition}
        onAnimationComplete={() => {
          if (!isOpen) setIsBodyVisible(false);
        }}
        className="overflow-hidden"
      >
        <Activity mode={isBodyVisible ? 'visible' : 'hidden'}>
          <Suspense fallback={null}>{children}</Suspense>
        </Activity>
      </motion.div>
    </div>
  );
}

/** Same length as the panel collapse, so the bar and the panel under it arrive together. */
const pinGlideTiming: KeyframeAnimationOptions = { duration: 200, easing: 'ease-in-out' };

/** Sticks to the bottom of its nav sheet and overlays the sheet's content while a panel is expanded. */
export function NavSheetPanels() {
  const navSheetPanel = useNavigationStore((state) => state.navSheetPanel);
  const toggleNavSheetPanel = useNavigationStore((state) => state.toggleNavSheetPanel);

  const hasOpenPanel = !!navSheetPanel;

  const barRef = useRef<HTMLDivElement>(null);
  const glideRef = useRef<Animation | null>(null);
  const paintedTopRef = useRef<number | null>(null);

  // In a menu longer than the screen, the bar's place at its end lies lower than the sheet's bottom edge, where it pins.
  // Pinning and unpinning glide over that distance with a transform, on the compositor. The store
  // write comes before React's commit, so the listener reads where the bar is painted, a running glide included.
  useEffect(
    () =>
      navigationStore.subscribe((state, prev) => {
        if (!state.navSheetPanel !== !prev.navSheetPanel) paintedTopRef.current = barRef.current?.getBoundingClientRect().top ?? null;
      }),
    [],
  );

  useLayoutEffect(() => {
    const bar = barRef.current;
    const from = paintedTopRef.current;
    paintedTopRef.current = null;
    if (!bar || from === null) return;

    glideRef.current?.cancel();
    const offset = from - bar.getBoundingClientRect().top;
    glideRef.current = Math.abs(offset) >= 1 ? bar.animate([{ transform: `translateY(${offset}px)` }, { transform: 'none' }], pinGlideTiming) : null;
  }, [hasOpenPanel]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // An open hover card takes the Escape first; the next one closes the panel
    if (event.key === 'Escape' && hasOpenPanel && !isHoverContentOpen()) {
      event.stopPropagation();
      toggleNavSheetPanel(navSheetPanel);
    }
  };

  return (
    <div ref={barRef} className={cn('relative z-20 mt-auto', hasOpenPanel && 'sticky bottom-0')} onKeyDown={handleKeyDown}>
      <AnimatePresence>
        {hasOpenPanel && (
          <motion.div
            key="panel-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 bottom-full left-0 z-10 h-[200vh] bg-overlay"
            onClick={() => toggleNavSheetPanel(navSheetPanel)}
          />
        )}
      </AnimatePresence>

      <FocusTrap active={hasOpenPanel}>
        <div
          className={cn(
            'flex flex-col gap-1 border-input border-t border-dashed bg-card px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]',
            hasOpenPanel && 'max-h-dvh overflow-y-auto shadow-lg',
          )}
        >
          <NavSheetPanel id="preferences" label="c:preferences" indicator={<PreferencesIndicators />}>
            <PreferencesContent />
          </NavSheetPanel>
          <NavSheetPanel id="info" label="c:info" indicator={<InfoIndicator />}>
            <InfoContent />
          </NavSheetPanel>
        </div>
      </FocusTrap>
    </div>
  );
}
