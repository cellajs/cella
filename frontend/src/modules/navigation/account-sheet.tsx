import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { LogOutIcon, RefreshCwIcon, SettingsIcon, UserRoundIcon, WrenchIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useMountedState } from '~/hooks/use-mounted-state';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { IconComponent } from '~/modules/common/icons/types';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/toaster';
import { NavSheetFrame } from '~/modules/navigation/nav-sheet-frame';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { useCurrentUser, useUserStore } from '~/modules/user/user-store';
import { cn } from '~/utils/cn';
import { fallbackContentRef } from '~/utils/fallback-content-ref';
import { numberToColorClass } from '~/utils/number-to-color-class';

type AccountButtonProps = { icon: IconComponent; label: string; id: string; action: string } & (
  | { offlineAccess: false; isOnline: boolean }
  | { offlineAccess: true; isOnline?: never }
);

function AccountButton({ offlineAccess, isOnline, icon: Icon, label, id, action }: AccountButtonProps) {
  const { t } = useTranslation();
  const keepNavOpen = useNavigationStore((state) => state.keepNavOpen);

  const isDisabled = offlineAccess ? false : !isOnline;
  return (
    <Button
      variant="ghost"
      size="lg"
      className="focus-effect w-full justify-start text-left hover:bg-accent/50 data-[sign-out=true]:text-destructive"
      data-sign-out={id === 'btn-signout'}
      render={
        <Link
          disabled={isDisabled}
          onClick={() => {
            if (isDisabled) {
              toaster.warning(t('c:action.offline.text'));
              return;
            }
            if (!keepNavOpen) useSheeter.getState().remove();
          }}
          id={id}
          draggable={false}
          to={action}
        />
      }
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}

/** The app runs installed, in its own window without browser controls. */
const isInstalledApp = () => window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && navigator.standalone === true);

export function AccountSheet() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const isSystemAdmin = useUserStore((state) => state.isSystemAdmin);
  const isMobile = useBreakpointBelow('sm', false);
  const isOnline = useOnlineManager();

  const router = useRouter();
  const queryClient = useQueryClient();

  const buttonWrapper = useRef<HTMLDivElement | null>(null);
  const { hasStarted } = useMountedState();

  useEffect(() => {
    if (isMobile) return;
    const firstRow = buttonWrapper.current?.querySelector<HTMLElement>('#btn-profile');
    firstRow?.focus();
  }, []);

  // Unless the nav is kept open, the nav sheets (this one, or the menu with this one stacked on it in a floating-nav
  // layout) close like they do for the links below; the profile sheet then returns focus to the nav button
  const openProfile = () => {
    if (!useNavigationStore.getState().keepNavOpen) {
      const navTrigger = useSheeter.getState().get('nav-sheet')?.triggerRef.current;
      if (navTrigger instanceof HTMLButtonElement) fallbackContentRef.current = navTrigger;
      // Blurred, so the profile sheet does not stash this sheet's button as its trigger
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      useSheeter.getState().remove();
    }
    navigate({ to: '.', search: (prev) => ({ ...prev, userSheetId: user.id }), resetScroll: false });
  };

  // What pull to refresh does, as a button: the installed app has no browser reload to fall back on
  const refresh = () => {
    if (!isOnline) return toaster.warning(t('c:action.offline.text'));
    if (!useNavigationStore.getState().keepNavOpen) useSheeter.getState().remove();
    Promise.allSettled([queryClient.invalidateQueries(), router.invalidate()]);
  };

  return (
    <NavSheetFrame ref={buttonWrapper} panels>
      <div className="flex items-center justify-between px-3 pt-3">
        <h2 className="p-2 font-semibold text-base">{t('c:account')}</h2>
      </div>
      <button type="button" tabIndex={-1} onClick={openProfile} className="relative mt-3 w-full">
        <div
          className={cn(
            'relative h-32 bg-center bg-cover shadow-[inset_0_-4px_12px_rgba(0,0,0,0.15)] transition-all duration-300',
            !user.bannerUrl && numberToColorClass(user.id),
          )}
          style={user.bannerUrl ? { backgroundImage: `url(${user.bannerUrl})` } : {}}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={hasStarted ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="absolute top-6 left-1/2 -ml-10"
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
          onClick={openProfile}
        >
          <UserRoundIcon className="size-4" aria-hidden="true" />
          {t('c:view_resource', { resource: t('c:profile').toLowerCase() })}
        </Button>
        <AccountButton offlineAccess={false} isOnline={isOnline} icon={SettingsIcon} id="btn-account" label={t('c:settings')} action="/account" />
        {isSystemAdmin && (
          <AccountButton offlineAccess={false} isOnline={isOnline} icon={WrenchIcon} id="btn-system" label={t('c:system_panel')} action="/system" />
        )}
        {isInstalledApp() && (
          <Button
            variant="ghost"
            size="lg"
            id="btn-refresh"
            className="focus-effect w-full justify-start text-left hover:bg-accent/50"
            onClick={refresh}
          >
            <RefreshCwIcon className="size-4" aria-hidden="true" />
            {t('c:refresh')}
          </Button>
        )}
        <AccountButton offlineAccess={false} isOnline={isOnline} icon={LogOutIcon} id="btn-signout" label={t('c:sign_out')} action="/auth/sign-out" />
      </div>
    </NavSheetFrame>
  );
}
