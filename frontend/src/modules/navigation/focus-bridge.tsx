import { useTranslation } from 'react-i18next';
import { closeNavSheet } from '~/modules/navigation/nav-sheet';
import { navigationStore, useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/** Shared by FocusBridge (source) and FocusTarget (destination); the content target is the app's `<main>` itself. */
export const focusTargets = { sheet: 'focus-target-sheet', content: 'app-content-inner', sidebar: 'focus-target-sidebar' } as const;

/** Invisible landing zone: place it inside the container a FocusBridge should jump to. */
export function FocusTarget({ target }: { target: 'sheet' | 'sidebar' }) {
  return <div id={focusTargets[target]} tabIndex={-1} className="sr-only" />;
}

/** Adds `tabindex=-1` when needed, so portaled content and a plain `<main>` can take focus. */
function focusElement(element: HTMLElement | null) {
  if (!element) return;
  if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1');
  element.focus();
}

const focusById = (id: string) => focusElement(document.getElementById(id));

/** First Tab stop of a layout, visible on focus: moves focus to the page's `<main>`, past the navigation (WCAG 2.4.1). */
export function SkipLink() {
  const { t } = useTranslation();

  return (
    <Button
      variant="outline"
      onClick={() => focusElement(document.querySelector('main'))}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-200 focus:h-10 focus:px-4 focus:shadow-floating"
    >
      {t('c:go_to_content')}
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

  if (direction === 'to-sheet' && !navSheetOpen) return null;

  const { target, label } = bridges[direction];

  const handleClick = () => {
    if (direction !== 'to-sheet' && !navigationStore.getState().keepNavOpen) {
      closeNavSheet();
      // Waits a frame for the closing sheet to release the page; its finalFocus then leaves focus on the target.
      requestAnimationFrame(() => focusById(target));
      return;
    }
    focusById(target);
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
