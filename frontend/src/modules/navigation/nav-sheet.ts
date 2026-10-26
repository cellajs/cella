import i18n from 'i18next';
import type { RefObject } from 'react';
import { appConfig } from 'shared';
import { navSheetId, type SheetData, sheeter } from '~/modules/common/sheeter/use-sheeter';
import type { UserMenuItem } from '~/modules/me/types';
import { navigationStore } from '~/modules/navigation/navigation-store';
import type { NavItemId } from '~/modules/navigation/types';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

/** Places a nav sheet beside the nav bar on sm+, at the screen edge without one; while keepNavOpen it trades its shadow for a border. */
const navSheetClassName = cn(
  tw(
    'xs:max-w-80 max-sm:shadow-[0_0_2px_5px_rgba(0,0,0,0.1)] sm:z-90 sm:w-80 sm:group-[.keep-nav-open]/body:border-r sm:group-[.keep-nav-open]/body:shadow-none dark:max-sm:shadow-[0_0_2px_5px_rgba(255,255,255,0.05)]',
  ),
  appConfig.navigation.navBar ? 'sm:left-16' : 'sm:left-0',
);

type SheetOrganization = Pick<UserMenuItem, 'id' | 'name'>;

/** Title and content key of a nav sheet. The key names the nav item only: the menu sheet fades between organizations itself. */
const navSheetIdentity = (id: NavItemId, organization?: SheetOrganization) => ({
  title: organization?.name ?? i18n.t(`c:${id}`),
  contentKey: id,
});

/** Options every nav sheet opens with; the caller adds the sheet id and side. */
export function navSheetOptions(
  id: NavItemId,
  triggerRef: RefObject<HTMLButtonElement | null>,
  organization?: SheetOrganization,
): Omit<SheetData, 'id' | 'side'> {
  return {
    triggerRef,
    ...navSheetIdentity(id, organization),
    headerClassName: 'hidden',
    modal: 'trap-focus',
    className: navSheetClassName,
    onClose: () => navigationStore.getState().setNavSheetOpen(null),
  };
}

/** Shows `organization` alone in the open menu sheet. */
export function showMenuOrganization(organization: SheetOrganization) {
  navigationStore.getState().setNavSheetOpen('menu', organization.id);
  sheeter.getState().update(navSheetId, navSheetIdentity('menu', organization));
}

/** Closes the nav sheet and clears which nav item has it open. */
export function closeNavSheet() {
  navigationStore.getState().setNavSheetOpen(null);
  sheeter.getState().remove(navSheetId);
}
