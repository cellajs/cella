import i18n from 'i18next';
import type { RefObject } from 'react';
import { navSheetId, type SheetData, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { navigationStore } from '~/modules/navigation/navigation-store';
import type { NavItemId } from '~/modules/navigation/types';
import { tw } from '~/utils/tw';

/** Places a nav sheet beside the sidebar icon bar on sm+; while keepNavOpen it trades its shadow for a border. */
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
    onClose: () => navigationStore.getState().setNavSheetOpen(null),
  };
}

/** Closes the nav sheet and clears which nav item has it open. */
export function closeNavSheet() {
  navigationStore.getState().setNavSheetOpen(null);
  sheeter.getState().remove(navSheetId);
}
