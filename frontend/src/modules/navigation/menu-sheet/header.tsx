import { Link } from '@tanstack/react-router';
import { BellIcon, UserIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { LogoMark, LogoText } from '~/modules/common/logo-art';
import { AccountNavIcon } from '~/modules/navigation/account-nav-icon';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { menuColumnsClass, menuHairlineClass } from '~/modules/navigation/menu-sheet/helpers/menu-columns';
import { openNavSheet } from '~/modules/navigation/nav-sheet';
import { NotificationsSheet } from '~/modules/notification/notifications-sheet';
import { UnreadCountBadge } from '~/modules/notification/unread-nav-badge';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';
import { cn } from '~/utils/cn';

const { navBar, menu } = appConfig.navigation;
// A desktop nav bar of organization buttons leads with the app icon going home, so the logo here would repeat it
const hasHomeOnNavBar = navBar && menu === 'perOrganization';

/** The logo home link, wherever no nav bar has a home button, and the notifications and account buttons where no nav bar holds them. */
export function MenuSheetHeader() {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className={cn(hasHomeOnNavBar && 'sm:hidden')}>
      <div className="flex h-16 items-center justify-between p-3">
        <Link
          to="/home"
          draggable={false}
          className={cn('focus-effect active:press flex items-center rounded-md transition-transform hover:scale-105', menuColumnsClass)}
          aria-label={t('c:go_to_home')}
          title={t('c:go_to_home')}
        >
          <span className="flex w-8 justify-center">
            <LogoMark className="size-7" />
          </span>
          <LogoText className="h-7 w-auto" />
        </Link>

        {user && (
          <div className={cn('flex items-center gap-1', navBar && 'hidden in-[.floating-nav]:flex')}>
            <Button
              ref={notificationsButtonRef}
              size="icon"
              variant="ghost"
              aria-label={t('c:notifications')}
              onClick={() => openNavSheet('notifications', <NotificationsSheet />, notificationsButtonRef, { stacked: true })}
              className="relative"
            >
              <BellIcon className="size-5" />
              <UnreadCountBadge className="absolute top-1 right-1" />
            </Button>
            <Button
              ref={accountButtonRef}
              size="icon"
              variant="ghost"
              aria-label={t('c:account')}
              onClick={() => openNavSheet('account', <AccountSheet />, accountButtonRef, { stacked: true })}
              className="group"
            >
              <AccountNavIcon icon={UserIcon} />
            </Button>
          </div>
        )}
      </div>
      <div className={menuHairlineClass} />
    </div>
  );
}
