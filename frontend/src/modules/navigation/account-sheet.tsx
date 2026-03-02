import { Link, useNavigate } from '@tanstack/react-router';
import { LogOutIcon, type LucideProps, SettingsIcon, UserRoundIcon, WrenchIcon } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { toaster } from '~/modules/common/toaster/service';
import { FocusBridge, FocusTarget } from '~/modules/navigation/focus-bridge';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import { numberToColorClass } from '~/utils/number-to-color-class';

type AccountButtonProps = {
  icon: React.ElementType<LucideProps>;
  label: string;
  id: string;
  action: string;
} & ({ offlineAccess: false; isOnline: boolean } | { offlineAccess: true; isOnline?: never });

/** Create a button for each account action */
function AccountButton({ offlineAccess, isOnline, icon: Icon, label, id, action }: AccountButtonProps) {
  const { t } = useTranslation();

  const isDisabled = offlineAccess ? false : !isOnline;
  return (
    <Button
      variant="ghost"
      size="lg"
      className="data-[sign-out=true]:text-red-600 hover:bg-accent/50 w-full justify-start text-left focus-effect"
      data-sign-out={id === 'btn-signout'}
      asChild
    >
      <Link
        disabled={isDisabled}
        onClick={() => {
          if (isDisabled) toaster(t('common:action.offline.text'), 'warning');
        }}
        id={id}
        draggable="false"
        to={action}
      >
        <Icon className="mr-2 size-4" aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}

/**
 * Account navigation sheet content.
 */
export const AccountSheet = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isSystemAdmin } = useUserStore();
  const isMobile = useBreakpoints('max', 'sm', false);
  const { isOnline } = useOnlineManager();

  const buttonWrapper = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isMobile) return;
    const firstRow = buttonWrapper.current?.querySelector<HTMLElement>('#btn-profile');
    firstRow?.focus();
  }, []);

  return (
    <div ref={buttonWrapper} className="p-3 bg-card w-full flex flex-col gap-4 min-h-screen">
      <FocusTarget target="sheet" />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => navigate({ to: '.', search: (prev) => ({ ...prev, userSheetId: user.id }), resetScroll: false })}
        className="w-full relative"
      >
        <div
          className={`relative transition-all shadow-[inset_0_-4px_12px_rgba(0,0,0,0.15)] duration-300 hover:bg-opacity-50 hover:-mx-10 -mx-5 -mt-3 bg-cover bg-center h-24 bg-opacity-80 ${
            user.bannerUrl ? '' : numberToColorClass(user.id)
          }`}
          style={user.bannerUrl ? { backgroundImage: `url(${user.bannerUrl})` } : {}}
        >
          <AvatarWrap
            className="h-16 w-16 absolute top-4 text-2xl left-[50%] -ml-8 rounded-full shadow-[0_0_0_4px_rgba(0,0,0,0.1)]"
            type="user"
            id={user.id}
            name={user.name}
            url={user.thumbnailUrl}
          />
        </div>
      </button>
      <div className="flex flex-col gap-1 max-sm:mt-4">
        {appConfig.mode === 'development' && (
          <div className="max-sm:hidden text-center text-sm text-foreground/50 mb-4">{user.id}</div>
        )}

        <Button
          variant="ghost"
          size="lg"
          id="btn-profile"
          className="hover:bg-accent/50 w-full justify-start text-left focus-effect"
          onClick={() =>
            navigate({ to: '.', search: (prev) => ({ ...prev, userSheetId: user.id }), resetScroll: false })
          }
        >
          <UserRoundIcon className="mr-2 size-4" aria-hidden="true" />
          {t('common:view_resource', { resource: t('common:profile').toLowerCase() })}
        </Button>
        <AccountButton
          offlineAccess={false}
          isOnline={isOnline}
          icon={SettingsIcon}
          id="btn-account"
          label={t('common:my_account')}
          action="/account"
        />
        {isSystemAdmin && (
          <AccountButton
            offlineAccess={false}
            isOnline={isOnline}
            icon={WrenchIcon}
            id="btn-system"
            label={t('common:system_panel')}
            action="/system/users"
          />
        )}
        <AccountButton
          offlineAccess={false}
          isOnline={isOnline}
          icon={LogOutIcon}
          id="btn-signout"
          label={t('common:sign_out')}
          action="/sign-out"
        />
      </div>
      {/* Keyboard-only skip links at end of sheet */}
      <div className="mt-auto flex flex-col">
        <FocusBridge direction="to-content" className="focus:relative" />
        <FocusBridge direction="to-sidebar" className="focus:relative" />
      </div>
    </div>
  );
};
