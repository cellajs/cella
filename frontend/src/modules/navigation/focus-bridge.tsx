import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { closeNavSheet, closeStackedNavSheet } from '~/modules/navigation/nav-sheet';
import { navigationStore, useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

/** Shared by FocusBridge (source) and FocusTarget (destination); the content target is the app's `<main>` itself. */
export const focusTargets = {
  sheet: 'focus-target-sheet',
  content: 'app-content-inner',
  sidebar: 'focus-target-sidebar',
  skipLink: 'skip-link',
} as const;

/** Invisible landing zone: place it inside the container a FocusBridge should jump to. The sheet's also takes a sheet's initial focus, so no tooltip opens with it. */
export function FocusTarget({ target }: { target: 'sheet' | 'sidebar' }) {
  return <div id={focusTargets[target]} tabIndex={-1} data-autofocus={target === 'sheet' || undefined} className="sr-only" />;
}

/** Adds `tabindex=-1` when needed, so portaled content and a plain `<main>` can take focus. */
function focusElement(element: HTMLElement | null) {
  if (!element) return;
  if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1');
  element.focus();
}

const focusById = (id: string) => focusElement(document.getElementById(id));

/**
 * Fixed on focus, in one spot at every scroll position, so reaching either end of a layout never moves the page.
 * `size-px border-0 p-0` outranks the button's own box, which would otherwise add its height to the page at the end of a layout.
 */
const layoutStopClass = tw(
  'sr-only size-px border-0 p-0 focus:not-sr-only focus:fixed focus:z-200 focus:h-10 focus:border focus:px-4 focus:shadow-floating',
);

/** First Tab stop of a layout, visible on focus: moves focus to the page's `<main>`, past the navigation (WCAG 2.4.1). */
export function SkipLink() {
  const { t } = useTranslation();

  return (
    <Button
      id={focusTargets.skipLink}
      variant="outline"
      onClick={() => focusElement(document.querySelector('main'))}
      className={cn(layoutStopClass, 'focus:top-3 focus:left-3')}
    >
      {t('c:go_to_content')}
    </Button>
  );
}

/** Last Tab stop of a layout, visible on focus: takes the page to the top and focus to the skip link, which a focus alone does not scroll to. */
export function BackToStart() {
  const { t } = useTranslation();

  const handleClick = () => {
    window.scrollTo(0, 0);
    focusById(focusTargets.skipLink);
  };

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      className={cn(layoutStopClass, 'focus:bottom-[calc(1rem+var(--bottom-inset,0px))] focus:left-1/2 focus:-translate-x-1/2')}
    >
      {t('c:go_to_start')}
    </Button>
  );
}

/** Where each bridge sends focus, and its label while it has focus. */
const bridges = {
  'to-sheet': { target: focusTargets.sheet, label: 'c:go_to_panel' },
  'to-content': { target: focusTargets.content, label: 'c:go_to_content' },
  'to-sidebar': { target: focusTargets.sidebar, label: 'c:go_to_navigation' },
} as const;

interface FocusBridgeProps {
  direction: keyof typeof bridges;
  className?: string;
}

export function FocusBridge({ direction, className }: FocusBridgeProps) {
  const { t } = useTranslation();
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const focusView = useUIStore((state) => state.focusView);

  if (direction === 'to-sheet' && !navSheetOpen) return null;
  // No sidebar to land on: an app without a nav bar has none, and focus view hides it
  if (direction === 'to-sidebar' && (!appConfig.navigation.navBar || focusView)) return null;

  const { target, label } = bridges[direction];

  const handleClick = () => {
    if (direction === 'to-sheet') return focusById(target);

    if (navigationStore.getState().keepNavOpen) closeStackedNavSheet();
    else closeNavSheet();
    // Waits a frame for the closing sheet to release the page; its finalFocus then leaves focus on the target.
    requestAnimationFrame(() => focusById(target));
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={cn('sr-only focus:not-sr-only focus:relative focus:z-200 max-sm:hidden', className)}
    >
      {t(label)}
    </Button>
  );
}
