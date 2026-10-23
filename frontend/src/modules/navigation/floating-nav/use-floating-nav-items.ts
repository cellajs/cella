import { ArrowUpIcon, MenuIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFirstTimeHint } from '~/hooks/use-first-time-hint';
import { useScrolledPast } from '~/hooks/use-scrolled-past';
import type { FloatingNavItem } from '~/modules/navigation/floating-nav/button';

interface FloatingNavItemsOptions {
  /** Prefix of the two item ids, `<idPrefix>-menu` and `<idPrefix>-scroll-top`. */
  idPrefix: string;
  /** Key under which the menu label's first-visit hint is marked seen. */
  hintKey: string;
  /** True while the page shows the floating nav; the scroll listeners run only then. */
  enabled: boolean;
  onToggleMenu: () => void;
}

/** A page's floating menu toggle, labelled "menu" at the top of a first visit, and its scroll-to-top button once scrolled down. */
export function useFloatingNavItems({ idPrefix, hintKey, enabled, onToggleMenu }: FloatingNavItemsOptions): FloatingNavItem[] {
  const { t } = useTranslation();

  const showScrollTop = useScrolledPast(300, enabled);
  // iOS overscroll keeps the scroll offset at or below 0, so it counts as the top
  const isAtTop = !useScrolledPast(8, enabled);
  const showMenuLabel = useFirstTimeHint(hintKey, enabled && isAtTop);

  return [
    {
      id: `${idPrefix}-menu`,
      icon: MenuIcon,
      onClick: onToggleMenu,
      ariaLabel: t('c:toggle_menu'),
      direction: 'left',
      label: t('c:menu'),
      labelVisible: showMenuLabel,
    },
    {
      id: `${idPrefix}-scroll-top`,
      icon: ArrowUpIcon,
      onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
      ariaLabel: t('c:scroll_to_top'),
      visible: showScrollTop,
      direction: 'right',
    },
  ];
}
