import { Link } from '@tanstack/react-router';
import { BellIcon, UserIcon } from 'lucide-react';
import { type ReactNode, type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { Logo } from '~/modules/common/logo';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { AccountNavIcon } from '~/modules/navigation/account-nav-icon';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { navIconStrokeWidth } from '~/modules/navigation/nav-buttons';
import { navSheetOptions } from '~/modules/navigation/nav-sheet';
import { navigationStore } from '~/modules/navigation/navigation-store';
import type { NavItemId } from '~/modules/navigation/types';
import { NotificationsSheet } from '~/modules/notification/notifications-sheet';
import { UnreadCountBadge } from '~/modules/notification/unread-nav-badge';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';
import { cn } from '~/utils/cn';

const { navBar, menu } = appConfig.navigation;
// A desktop nav bar of organization buttons leads with the app icon going home, so the logo here would repeat it
const hasHomeOnNavBar = navBar && menu === 'perOrganization';

/** Stacks a nav sheet over the menu sheet, for layouts with no nav bar to open it from: no bar at all, or a floating-nav page. */
function openStackedNavSheet(id: NavItemId, content: ReactNode, triggerRef: RefObject<HTMLButtonElement | null>) {
  navigationStore.getState().setNavSheetOpen(id);
  sheeter.getState().create(content, { ...navSheetOptions(id, triggerRef), id: `${id}-sheet`, side: 'left', disablePointerDismissal: true });
}

/** The logo home link, wherever no nav bar has a home button, and the notifications and account buttons where no nav bar holds them. */
export function MenuSheetHeader() {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className={cn('h-14 p-3 pb-1', hasHomeOnNavBar && 'sm:hidden')}>
      <div className="flex h-10 items-center justify-between">
        <Link
          to="/home"
          draggable={false}
          className="focus-effect active:press block rounded-md transition-transform hover:scale-105"
          aria-label={t('c:go_to_home')}
        >
          <Logo className="mx-1 h-8" title={t('c:go_to_home')} />
        </Link>

        {user && (
          <div className={cn('flex items-center gap-1', navBar && 'in-[.floating-nav]:flex hidden')}>
            <Button
              ref={notificationsButtonRef}
              size="icon"
              variant="ghost"
              aria-label={t('c:notifications')}
              onClick={() => openStackedNavSheet('notifications', <NotificationsSheet />, notificationsButtonRef)}
              className="relative"
            >
              <BellIcon className="size-5" strokeWidth={navIconStrokeWidth} />
              <UnreadCountBadge className="absolute top-1 right-1" />
            </Button>
            <Button
              ref={accountButtonRef}
              size="icon"
              variant="ghost"
              aria-label={t('c:account')}
              onClick={() => openStackedNavSheet('account', <AccountSheet />, accountButtonRef)}
              className="group"
            >
              <AccountNavIcon icon={UserIcon} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
