import { Link } from '@tanstack/react-router';
import { BellIcon } from 'lucide-react';
import { type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { Logo } from '~/modules/common/logo';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { navIconStrokeWidth } from '~/modules/navigation/nav-buttons';
import { navSheetOptions } from '~/modules/navigation/nav-sheet';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import type { NavItemId } from '~/modules/navigation/types';
import { NotificationsSheet } from '~/modules/notification/notifications-sheet';
import { UnreadCountBadge } from '~/modules/notification/unread-nav-badge';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';

/** Stacks a nav sheet over the menu sheet; floating-nav layouts have no bottom bar to open it from. */
function openStackedNavSheet(id: NavItemId, content: React.ReactNode, triggerRef: RefObject<HTMLButtonElement | null>) {
  useNavigationStore.getState().setNavSheetOpen(id);
  useSheeter.getState().create(content, { ...navSheetOptions(id, triggerRef), id: `${id}-sheet`, side: 'left', disablePointerDismissal: true });
}

export function MenuSheetHeader() {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const notificationsButtonRef = useRef<HTMLButtonElement | null>(null);
  const accountButtonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="h-14 p-3 pb-1">
      <div className="flex h-10 items-center justify-between">
        <Link
          to="/home"
          draggable={false}
          className="focus-effect active:press block rounded-md transition-transform hover:scale-105"
          aria-label={t('c:go_to_home')}
        >
          <Logo className="mx-1 h-8" title={t('c:go_to_home')} />
        </Link>

        {/* Only shown inside a floating-nav layout. */}
        {user && (
          <div className="in-[.floating-nav]:flex hidden items-center gap-1">
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
            >
              <EntityAvatar
                className="size-7 rounded-full border-[0.1rem] border-current"
                type="user"
                id={user.id}
                name={user.name}
                url={user.thumbnailUrl}
              />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
