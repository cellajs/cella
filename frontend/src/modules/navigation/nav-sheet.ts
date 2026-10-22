import i18n from 'i18next';
import type { RefObject } from 'react';
import { type SheetData, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import type { NavItemId } from '~/modules/navigation/types';
import { tw } from '~/utils/tw';

/** Positions a nav sheet next to the sidebar icon bar on sm+; pushes content when keepNavOpen. */
const navSheetClassName = tw(
  'xs:max-w-80 max-sm:shadow-[0_0_2px_5px_rgba(0,0,0,0.1)] sm:left-16 sm:z-90 sm:w-80 sm:group-[.keep-nav-open]/body:border-r sm:group-[.keep-nav-open]/body:shadow-none dark:max-sm:shadow-[0_0_2px_5px_rgba(255,255,255,0.05)]',
);

/** Options every nav sheet opens with; the caller adds the sheet id and side. */
export function navSheetOptions(id: NavItemId, triggerRef: RefObject<HTMLButtonElement | null>): Omit<SheetData, 'id' | 'side'> {
  return {
    triggerRef,
    title: i18n.t(`c:${id}`),
    headerClassName: 'hidden',
    modal: 'trap-focus',
    className: navSheetClassName,
    contentKey: id,
    onClose: () => useNavigationStore.getState().setNavSheetOpen(null),
  };
}

/** Closes the nav sheet and clears which nav item has it open. */
export function closeNavSheet() {
  useNavigationStore.getState().setNavSheetOpen(null);
  useSheeter.getState().remove('nav-sheet');
}
