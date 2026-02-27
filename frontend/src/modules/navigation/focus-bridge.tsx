import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
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
 * Focus a specific element by ID, temporarily making it focusable if needed.
 * This is more reliable than querySelector chains for portaled content.
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

/**
 * Keyboard-only skip link that bridges focus between the sidebar nav and the open sheet panel.
 * Invisible by default, becomes visible on focus (Tab). Follows the WAI "skip navigation" pattern.
 *
 * Each target uses a stable element ID so focus lands reliably regardless of
 * portaled content, Radix focus management, or ScrollArea nesting.
 */
export function FocusBridge({ direction, className }: FocusBridgeProps) {
  const { t } = useTranslation();
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);

  if (direction === 'to-sheet' && !navSheetOpen) return null;

  const labels = {
    'to-sheet': t('common:go_to_panel'),
    'to-content': t('common:go_to_content'),
    'to-sidebar': t('common:go_to_navigation'),
  };

  const targets = {
    'to-sheet': focusTargets.sheet,
    'to-content': focusTargets.content,
    'to-sidebar': focusTargets.sidebar,
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => focusById(targets[direction])}
      className={cn('sr-only focus:not-sr-only focus:absolute focus:z-200', className)}
    >
      {labels[direction]}
    </Button>
  );
}
