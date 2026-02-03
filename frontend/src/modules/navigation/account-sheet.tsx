import { Link } from '@tanstack/react-router';
import { LogOutIcon, type LucideProps, SettingsIcon, UserRoundIcon, WrenchIcon } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { toaster } from '~/modules/common/toaster/service';
import { buttonVariants } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';
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
    <Link
      disabled={isDisabled}
      onClick={() => {
        if (isDisabled) toaster(t('common:action.offline.text'), 'warning');
      }}
      data-sign-out={id === 'btn-signout'}
      id={id}
      draggable="false"
      to={action}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'lg' }),
        'data-[sign-out=true]:text-red-600 hover:bg-accent/50 w-full justify-start text-left focus-effect',
      )}
    >
      <Icon className="mr-2 size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

/**
 * Account navigation sheet content.
 */
export const AccountSheet = () => {
  const { t } = useTranslation();
  const { user, systemRole } = useUserStore();
  const isMobile = useBreakpoints('max', 'sm');
  const { isOnline } = useOnlineManager();

  const isSystemAdmin = systemRole === 'admin';
  const buttonWrapper = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isMobile) return;
    const firstRow = buttonWrapper.current?.querySelector<HTMLElement>('#btn-profile');
    firstRow?.focus();
  }, []);

  return (
    <div ref={buttonWrapper} className="p-3 w-full flex flex-col gap-4 min-h-[calc(100vh-0.5rem)]">
      <Link to="/user/$idOrSlug" params={{ idOrSlug: user.slug }} className="w-full relative">
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
      </Link>
      <div className="flex flex-col gap-1 max-sm:mt-4">
        <AccountButton
          offlineAccess={false}
          isOnline={isOnline}
          icon={UserRoundIcon}
          id="btn-profile"
          label={t('common:view_resource', { resource: t('common:profile').toLowerCase() })}
          action={`/user/${user.slug}`}
        />
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
    </div>
  );
};
