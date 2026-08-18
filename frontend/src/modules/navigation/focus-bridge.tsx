import { useTranslation } from 'react-i18next';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/** Shared by FocusBridge (source) and FocusTarget (destination). */
export const focusTargets = {
  sheet: 'focus-target-sheet',
  content: 'focus-target-content',
  sidebar: 'focus-target-sidebar',
} as const;

/** Invisible landing zone: place it inside the container a FocusBridge should jump to. */
export function FocusTarget({ target }: { target: keyof typeof focusTargets }) {
  return <div id={focusTargets[target]} tabIndex={-1} className="sr-only" />;
}

/** Adds `tabindex=-1` when needed, so portaled content can take focus. */
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
      // Waits for @base-ui's finalFocus restoration to complete.
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
