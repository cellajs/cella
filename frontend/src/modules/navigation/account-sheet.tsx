import { Link, useNavigate } from '@tanstack/react-router';
import { LogOutIcon, type LucideProps, SettingsIcon, UserRoundIcon, WrenchIcon } from 'lucide-react';
import { motion } from 'motion/react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useMountedState } from '~/hooks/use-mounted-state';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { toaster } from '~/modules/common/toaster/toaster';
import { FocusBridge, FocusTarget } from '~/modules/navigation/focus-bridge';
import { MenuSheetPanels } from '~/modules/navigation/menu-sheet/sheet-panel';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';
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
      className="focus-effect w-full justify-start text-left hover:bg-accent/50 data-[sign-out=true]:text-red-600"
      data-sign-out={id === 'btn-signout'}
      render={
        <Link
          disabled={isDisabled}
          onClick={() => {
            if (isDisabled) toaster(t('c:action.offline.text'), 'warning');
          }}
          id={id}
          draggable={false}
          to={action}
        />
      }
    >
      <Icon className="mr-2 size-4" aria-hidden="true" />
      {label}
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
  const isMobile = useBreakpointBelow('sm', false);
  const isOnline = useOnlineManager();

  const buttonWrapper = useRef<HTMLDivElement | null>(null);
  const { hasStarted } = useMountedState();

  useEffect(() => {
    if (isMobile) return;
    const firstRow = buttonWrapper.current?.querySelector<HTMLElement>('#btn-profile');
    firstRow?.focus();
  }, []);

  return (
    <div ref={buttonWrapper} className="group/menu flex min-h-screen w-full flex-col bg-card">
      <FocusTarget target="sheet" />
      <div className="flex items-center justify-between px-3 pt-3">
        <h2 className="p-2 font-semibold text-base">{t('c:account')}</h2>
      </div>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => navigate({ to: '.', search: (prev) => ({ ...prev, userSheetId: user.id }), resetScroll: false })}
        className="relative mt-3 w-full"
      >
        <div
          className={`relative h-32 bg-center bg-cover bg-opacity-80 shadow-[inset_0_-4px_12px_rgba(0,0,0,0.15)] transition-all duration-300 hover:bg-opacity-50 ${
            user.bannerUrl ? '' : numberToColorClass(user.id)
          }`}
          style={user.bannerUrl ? { backgroundImage: `url(${user.bannerUrl})` } : {}}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={hasStarted ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="absolute top-6 left-[50%] -ml-10"
          >
            <EntityAvatar
              className="size-20 rounded-full text-2xl shadow-[0_0_0_4px_rgba(0,0,0,0.1)]"
              type="user"
              id={user.id}
              name={user.name}
              url={user.thumbnailUrl}
            />
          </motion.div>
        </div>
      </button>
      <div className="mt-3 flex flex-col gap-1 px-3 max-sm:mt-4">
        <Button
          variant="ghost"
          size="lg"
          id="btn-profile"
          className="focus-effect w-full justify-start text-left hover:bg-accent/50"
          onClick={() =>
            navigate({ to: '.', search: (prev) => ({ ...prev, userSheetId: user.id }), resetScroll: false })
          }
        >
          <UserRoundIcon className="mr-2 size-4" aria-hidden="true" />
          {t('c:view_resource', { resource: t('c:profile').toLowerCase() })}
        </Button>
        <AccountButton
          offlineAccess={false}
          isOnline={isOnline}
          icon={SettingsIcon}
          id="btn-account"
          label={t('c:settings')}
          action="/account"
        />
        {isSystemAdmin && (
          <AccountButton
            offlineAccess={false}
            isOnline={isOnline}
            icon={WrenchIcon}
            id="btn-system"
            label={t('c:system_panel')}
            action="/system/users"
          />
        )}
        <AccountButton
          offlineAccess={false}
          isOnline={isOnline}
          icon={LogOutIcon}
          id="btn-signout"
          label={t('c:sign_out')}
          action="/sign-out"
        />
      </div>

      <span className="mt-10" />
      <MenuSheetPanels />

      {/* Keyboard-only skip links at end of sheet */}
      <div className="flex flex-col focus-within:p-3">
        <FocusBridge direction="to-content" className="focus:relative" />
        <FocusBridge direction="to-sidebar" className="focus:relative" />
      </div>
    </div>
  );
};
