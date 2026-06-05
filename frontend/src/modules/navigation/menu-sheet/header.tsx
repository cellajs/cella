import { Link } from '@tanstack/react-router';
import { useRef } from 'react';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { Logo } from '~/modules/marketing/logo';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { navSheetClassName } from '~/modules/navigation/nav-sheet-constants';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';

/**
 * Combined header with logo and preferences.
 * Also renders floating-nav return bar (visible only in floating-nav context).
 */
export const MenuSheetHeader = () => {
  const { user } = useUserStore();
  const setNavSheetOpen = useNavigationStore((state) => state.setNavSheetOpen);
  const accountButtonRef = useRef<HTMLButtonElement | null>(null);

  const openAccount = () => {
    setNavSheetOpen('account');
    useSheeter.getState().create(<AccountSheet />, {
      id: 'account-sheet',
      triggerRef: accountButtonRef,
      side: 'left',
      modal: 'trap-focus',
      disablePointerDismissal: true,
      className: navSheetClassName,
      contentKey: 'account',
      onClose: () => setNavSheetOpen(null),
    });
  };

  return (
    <div className="relative h-14 p-3 pb-1">
      <div className="flex h-10 items-center justify-between">
        {/* Logo */}
        <Link
          to="/home"
          draggable={false}
          className="focus-effect block rounded-md transition-transform hover:scale-105 active:translate-y-[.05rem]"
        >
          <Logo height={34} className="mx-1" />
        </Link>

        <div className="group/actions flex items-center gap-2">
          {/* User button - only visible when floating nav is present */}
          {user && (
            <Button
              ref={accountButtonRef}
              size="icon"
              variant="ghost"
              onClick={openAccount}
              className="in-[.floating-nav]:inline-flex hidden size-10"
            >
              <EntityAvatar
                className="size-7 rounded-full border-[0.1rem] border-primary"
                type="user"
                id={user.id}
                name={user.name}
                url={user.thumbnailUrl}
              />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
