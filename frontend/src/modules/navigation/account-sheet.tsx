import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { LogOutIcon, RefreshCwIcon, SettingsIcon, UserRoundIcon, WrenchIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useMountedState } from '~/hooks/use-mounted-state';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { navSheetId, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { NavSheetFrame } from '~/modules/navigation/nav-sheet-frame';
import { NavSheetRow } from '~/modules/navigation/nav-sheet-row';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { useCurrentUser, useUserStore } from '~/modules/user/user-store';
import { cn } from '~/utils/cn';
import { fallbackContentRef } from '~/utils/fallback-content-ref';
import { placeholderColorClass } from '~/utils/placeholder-color-class';

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

  const frameRef = useRef<HTMLDivElement>(null);
  const { hasStarted } = useMountedState();

  useEffect(() => {
    if (isMobile) return;
    const firstRow = frameRef.current?.querySelector<HTMLElement>('#btn-profile');
    firstRow?.focus();
  }, []);

  // Unless keepNavOpen, every sheet closes, a menu sheet under this one too; the profile sheet then returns focus to the nav button
  const openProfile = () => {
    if (!navigationStore.getState().keepNavOpen) {
      const navTrigger = sheeter.getState().get(navSheetId)?.triggerRef.current;
      if (navTrigger instanceof HTMLButtonElement) fallbackContentRef.current = navTrigger;
      // Blurred, so the profile sheet does not stash this sheet's button as its trigger
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      sheeter.getState().remove();
    }
    navigate({ to: '.', search: (prev) => ({ ...prev, userSheetId: user.id }), resetScroll: false });
  };

  // What pull to refresh does, as a button: the installed app has no browser reload to fall back on
  const refresh = () => {
    if (!isOnline) return toastOffline();
    if (!navigationStore.getState().keepNavOpen) sheeter.getState().remove();
    Promise.allSettled([queryClient.invalidateQueries(), router.invalidate()]);
  };

  return (
    <NavSheetFrame ref={frameRef} panels>
      <div className="px-3 pt-3">
        <h2 className="p-2 font-semibold text-base">{t('c:account')}</h2>
      </div>
      <button type="button" tabIndex={-1} onClick={openProfile} className="mt-3 w-full">
        <div
          className={cn(
            'relative h-32 bg-center bg-cover shadow-[inset_0_-4px_12px_rgba(0,0,0,0.15)] transition-colors duration-300',
            !user.bannerUrl && placeholderColorClass(user.id),
          )}
          style={user.bannerUrl ? { backgroundImage: `url(${user.bannerUrl})` } : {}}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={hasStarted ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="absolute top-6 left-1/2 -ml-10"
          >
            <EntityAvatar className="size-20 ring-4 ring-black/10" type="user" id={user.id} name={user.name} url={user.thumbnailUrl} />
          </motion.div>
        </div>
      </button>
      <div className="mt-3 flex flex-col gap-1 px-3 max-sm:mt-4">
        <NavSheetRow icon={UserRoundIcon} id="btn-profile" label={t('c:view_resource', { resource: t('c:profile') })} onClick={openProfile} />
        <NavSheetRow isOnline={isOnline} icon={SettingsIcon} id="btn-account" label={t('c:account_settings')} to="/account" />
        {isSystemAdmin && <NavSheetRow isOnline={isOnline} icon={WrenchIcon} id="btn-system" label={t('c:system_panel')} to="/system" />}
        {isInstalledApp() && <NavSheetRow icon={RefreshCwIcon} id="btn-refresh" label={t('c:refresh')} onClick={refresh} />}
        <NavSheetRow isOnline={isOnline} icon={LogOutIcon} id="btn-signout" label={t('c:sign_out')} to="/auth/sign-out" destructive />
      </div>
    </NavSheetFrame>
  );
}
