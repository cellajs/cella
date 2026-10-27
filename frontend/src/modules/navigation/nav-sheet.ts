import i18n from 'i18next';
import type { ReactNode, RefObject } from 'react';
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

interface OpenNavSheetOptions {
  /** The organization the menu sheet shows alone. */
  organization?: SheetOrganization;
  side?: 'left' | 'right';
  /** Opens over the menu sheet, for layouts with no nav bar to open it from: no bar at all, or a floating-nav page. */
  stacked?: boolean;
}

/** Opens the sheet of nav item `id` with `content` and records that item as the one with its sheet open. */
export function openNavSheet(
  id: NavItemId,
  content: ReactNode,
  triggerRef: RefObject<HTMLButtonElement | null>,
  { organization, side = 'left', stacked = false }: OpenNavSheetOptions = {},
) {
  navigationStore.getState().setNavSheetOpen(id, organization?.id);

  const data: Omit<SheetData, 'id'> = {
    triggerRef,
    ...navSheetIdentity(id, organization),
    side,
    headerClassName: 'hidden',
    modal: 'trap-focus',
    className: navSheetClassName,
    onClose: () => navigationStore.getState().setNavSheetOpen(null),
  };

  if (stacked) {
    sheeter.getState().create(content, { ...data, id: `${id}-sheet`, disablePointerDismissal: true });
    return;
  }
  // Outside-press is gated by `keepNavOpen` in the sheeter's onOpenChange; disabling it here suppresses the event entirely.
  sheeter.getState().replace(content, { ...data, id: navSheetId, disablePointerDismissal: false, autoScrollOnDrag: 'vertical' });
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
