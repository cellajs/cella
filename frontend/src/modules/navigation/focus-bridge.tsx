import { useTranslation } from 'react-i18next';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/**
 * Stable element IDs used by the focus bridge system.
 * Defined here so both FocusBridge (source) and FocusTarget (destination) reference the same values.
 */
export const focusTargets = {
  sheet: 'focus-target-sheet',
  content: 'focus-target-content',
  sidebar: 'focus-target-sidebar',
} as const;

/**
 * Invisible focus landing zone. Place this inside the container you want
 * a FocusBridge to jump to. Receives programmatic focus via `focusById`.
 */
export function FocusTarget({ target }: { target: keyof typeof focusTargets }) {
  return <div id={focusTargets[target]} tabIndex={-1} className="sr-only" />;
}

/**
 * Focus a specific element by ID. Adds `tabindex=-1` when needed, which is more
 * reliable than querySelector chains for portaled content.
 */
function focusById(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus();
}

interface FocusBridgeProps {
  direction: 'to-sheet' | 'to-sidebar' | 'to-content';
  className?: string;
}

/** Keyboard skip link between sidebar and sheet, using stable IDs across portals and focus managers. */
export function FocusBridge({ direction, className }: FocusBridgeProps) {
  const { t } = useTranslation();
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);

  if (direction === 'to-sheet' && !navSheetOpen) return null;

  const labels = {
    'to-sheet': t('c:go_to_panel'),
    'to-content': t('c:go_to_content'),
    'to-sidebar': t('c:go_to_navigation'),
  };

  const targets = {
    'to-sheet': focusTargets.sheet,
    'to-content': focusTargets.content,
    'to-sidebar': focusTargets.sidebar,
  };

  const handleClick = () => {
    if (direction !== 'to-sheet' && !useNavigationStore.getState().keepNavOpen) {
      useSheeter.getState().remove('nav-sheet');
      // Re-focus after @base-ui's finalFocus restoration completes
      requestAnimationFrame(() => focusById(targets[direction]));
      return;
    }
    focusById(targets[direction]);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={cn('sr-only focus:not-sr-only focus:absolute focus:z-200 max-sm:hidden', className)}
    >
      {labels[direction]}
    </Button>
  );
}
