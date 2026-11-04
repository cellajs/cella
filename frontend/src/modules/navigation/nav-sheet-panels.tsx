import { ChevronDownIcon, ChevronRightIcon, CircleQuestionMarkIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Activity, type KeyboardEvent, type ReactNode, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useEventListener } from '~/hooks/use-event-listener';
import type { TKey } from '~/lib/i18n-locales';
import { collapseMotion } from '~/modules/common/collapse-motion';
import { FocusTrap } from '~/modules/common/focus-trap';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { Spinner } from '~/modules/common/spinner';
import { menuHairlineClass } from '~/modules/navigation/menu-sheet/helpers/menu-columns';
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
  /** Shows a help toggle on the open panel, which opens every description in its body through `group/help`. */
  help?: boolean;
  children: ReactNode;
}

/** The help toggle of an open panel; a question mark that fills while the descriptions show, so it never reads as a second chevron. */
function NavSheetHelpToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const helpOpen = useNavigationStore((state) => state.navSheetHelpOpen);
  const setNavSheetHelpOpen = useNavigationStore((state) => state.setNavSheetHelpOpen);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t('c:help')}
      aria-expanded={helpOpen}
      press={false}
      onClick={() => setNavSheetHelpOpen(!helpOpen)}
      className={cn('size-7 text-muted-foreground aria-expanded:bg-transparent', className)}
    >
      <CircleQuestionMarkIcon className={cn('size-4 transition-colors duration-200', helpOpen && 'fill-foreground [&_path]:stroke-background')} />
    </Button>
  );
}

/** Opens the descriptions inside it while help is open, for `group-data-[help-open=true]/help` variants. */
function NavSheetHelpScope({ className, children }: { className?: string; children: ReactNode }) {
  const helpOpen = useNavigationStore((state) => state.navSheetHelpOpen);

  return (
    <div data-help-open={helpOpen} className={cn('group/help', className)}>
      {children}
    </div>
  );
}

/**
 * A panel whose body renders hidden while it is closed, so what the body loads (a lazy tool, a suspense query) is in
 * place before it opens and the collapse animates to the body's full height. A hidden body runs no effects, so it polls
 * nothing, and what it reads in an effect arrives after the collapse measured it: a read that changes the body's height suspends.
 */
function NavSheetPanel({ id, label, indicator, help, children }: NavSheetPanelProps) {
  const { t } = useTranslation();
  const navSheetPanel = useNavigationStore((state) => state.navSheetPanel);
  const toggleNavSheetPanel = useNavigationStore((state) => state.toggleNavSheetPanel);

  const isOpen = navSheetPanel === id;

  // Stays visible until the collapse ends, so the body shows while the panel closes and the indicator waits for it
  const [isBodyVisible, setIsBodyVisible] = useState(isOpen);
  if (isOpen && !isBodyVisible) setIsBodyVisible(true);

  return (
    <div>
      <div className="relative">
        <Button onClick={() => toggleNavSheetPanel(id)} className="w-full justify-between" variant={isOpen ? 'secondary' : 'ghost'}>
          <span className="flex items-center gap-2">
            {t(label)}
            {!isBodyVisible && <span className="fade-in flex animate-in items-center gap-2 duration-200">{indicator}</span>}
          </span>
          <ChevronDownIcon className={cn('opacity-50 transition-transform duration-200', isOpen && 'rotate-180')} />
        </Button>
        {/* Over the panel button, which may not hold another button; a hidden copy of the label puts the toggle right after it */}
        {help && isOpen && (
          <div className="pointer-events-none absolute inset-0 flex items-center px-3 font-medium text-sm">
            <span className="invisible">{t(label)}</span>
            <NavSheetHelpToggle className="fade-in pointer-events-auto ml-1.5 animate-in duration-200" />
          </div>
        )}
      </div>

      <motion.div
        initial={false}
        animate={isOpen ? collapseMotion.animate : collapseMotion.exit}
        transition={collapseMotion.transition}
        onAnimationComplete={() => {
          if (!isOpen) setIsBodyVisible(false);
        }}
        // The 4px either side holds the focus ring (offset plus ring) of full-width rows, which the clip would cut
        className="-mx-1 overflow-hidden px-1"
      >
        <Activity mode={isBodyVisible ? 'visible' : 'hidden'}>
          <NavSheetHelpScope>
            <Suspense fallback={null}>{children}</Suspense>
          </NavSheetHelpScope>
        </Activity>
      </motion.div>
    </div>
  );
}

/** A phone's panel: a row that opens the panel's content in a bottom drawer over the menu, which stays as it was. */
function NavSheetPanelRow({ id, label, indicator, help, children }: NavSheetPanelProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const openDrawer = () =>
    sheeter.getState().create(
      <NavSheetHelpScope className="px-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      </NavSheetHelpScope>,
      {
        id: `${id}-panel`,
        triggerRef,
        title: t(label),
        // The toggle hangs right of the title, which stays centered as the other panel titles are
        titleContent: help ? (
          <span className="relative">
            {t(label)}
            <NavSheetHelpToggle className="absolute inset-y-0 left-full my-auto ml-2" />
          </span>
        ) : undefined,
        side: 'bottom',
        onClose: () => navigationStore.getState().setNavSheetHelpOpen(false),
      },
    );

  return (
    <Button ref={triggerRef} onClick={openDrawer} className="w-full justify-between" variant="ghost">
      <span className="flex items-center gap-2">
        {t(label)}
        {indicator}
      </span>
      <ChevronRightIcon className="opacity-50" />
    </Button>
  );
}

/** Same length as the panel collapse, so the bar and the panel under it arrive together. */
const pinGlideTiming: KeyframeAnimationOptions = { duration: 200, easing: 'ease-in-out' };

/** The panels at the end of a nav sheet: rows that open bottom drawers on a phone, a bar that expands over the sheet from `sm` up. */
export function NavSheetPanels() {
  const isMobile = useBreakpointBelow('sm', false);

  if (isMobile) {
    return (
      <div className="relative mt-auto flex flex-col gap-1 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <div aria-hidden className={cn(menuHairlineClass, 'absolute inset-x-0 top-0')} />
        <NavSheetPanelRow id="preferences" label="c:preferences" indicator={<PreferencesIndicators />} help>
          <PreferencesContent />
        </NavSheetPanelRow>
        <NavSheetPanelRow id="info" label="c:info" indicator={<InfoIndicator />}>
          <InfoContent />
        </NavSheetPanelRow>
      </div>
    );
  }
  return <NavSheetPanelBar />;
}

/** Sticks to the bottom of its nav sheet and overlays the sheet's content while a panel is expanded. */
function NavSheetPanelBar() {
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

  // A press the card did not mark closes the panel; React dispatches a portaled hover card's press through the card first
  const insidePressRef = useRef<PointerEvent | null>(null);
  useEventListener(
    'pointerdown',
    (event) => {
      if (hasOpenPanel && event !== insidePressRef.current) toggleNavSheetPanel(navSheetPanel);
    },
    { enabled: hasOpenPanel },
  );

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
          />
        )}
      </AnimatePresence>

      <FocusTrap active={hasOpenPanel}>
        <div
          className={cn(
            'relative flex flex-col gap-1 bg-card px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]',
            hasOpenPanel && 'max-h-dvh overflow-y-auto shadow-lg',
          )}
          onPointerDownCapture={(event) => {
            insidePressRef.current = event.nativeEvent;
          }}
        >
          {/* An open panel lifts the bar over the sheet, which needs no line then */}
          {!hasOpenPanel && <div aria-hidden className={cn(menuHairlineClass, 'absolute inset-x-0 top-0')} />}
          <NavSheetPanel id="preferences" label="c:preferences" indicator={<PreferencesIndicators />} help>
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
