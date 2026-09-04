import { Link } from '@tanstack/react-router';
import { BellIcon } from 'lucide-react';
import { type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { Logo } from '~/modules/common/logo';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { navSheetClassName } from '~/modules/navigation/nav-sheet-constants';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import type { NavItemId } from '~/modules/navigation/types';
import { NotificationsSheet } from '~/modules/notification/notifications-sheet';
import { UnreadCountBadge } from '~/modules/notification/unread-nav-badge';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';

/** Stacks a nav sheet over the menu sheet; floating-nav layouts have no bottom bar to open it from. */
function openStackedNavSheet(id: NavItemId, content: React.ReactNode, triggerRef: RefObject<HTMLButtonElement | null>) {
  const setNavSheetOpen = useNavigationStore.getState().setNavSheetOpen;
  setNavSheetOpen(id);
  useSheeter.getState().create(content, {
    id: `${id}-sheet`,
    triggerRef,
    side: 'left',
    modal: 'trap-focus',
    disablePointerDismissal: true,
    className: navSheetClassName,
    contentKey: id,
    onClose: () => setNavSheetOpen(null),
  });
}

export function MenuSheetHeader() {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const notificationsButtonRef = useRef<HTMLButtonElement | null>(null);
  const accountButtonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="relative h-14 p-3 pb-1">
      <div className="flex h-10 items-center justify-between">
        <Link
          to="/home"
          draggable={false}
          className="focus-effect block rounded-md transition-transform hover:scale-105 active:translate-y-[.05rem]"
        >
          <Logo className="mx-1 h-8" />
        </Link>

        {/* Only shown inside a floating-nav layout. */}
        {user && (
          <div className="group/actions in-[.floating-nav]:flex hidden items-center gap-1">
            <Button
              ref={notificationsButtonRef}
              size="icon"
              variant="ghost"
              aria-label={t('c:notifications')}
              onClick={() => openStackedNavSheet('notifications', <NotificationsSheet />, notificationsButtonRef)}
              className="relative size-10"
            >
              <BellIcon className="size-5" strokeWidth={1.8} />
              <UnreadCountBadge className="absolute top-1 right-1" />
            </Button>
            <Button
              ref={accountButtonRef}
              size="icon"
              variant="ghost"
              aria-label={t('c:account')}
              onClick={() => openStackedNavSheet('account', <AccountSheet />, accountButtonRef)}
              className="size-10"
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
