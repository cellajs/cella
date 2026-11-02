import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { CameraIcon, ImageUpIcon, LogOutIcon, RefreshCwIcon, SettingsIcon, UserRoundIcon, WrenchIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useMountedState } from '~/hooks/use-mounted-state';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { navSheetId, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';
import { openImageUpload } from '~/modules/common/uploader/open-image-upload';
import { NavSheetFrame } from '~/modules/navigation/nav-sheet-frame';
import { NavSheetRow } from '~/modules/navigation/nav-sheet-row';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { useUpdateUser } from '~/modules/user/query';
import { useCurrentUser, useUserStore } from '~/modules/user/user-store';
import { cn } from '~/utils/cn';
import { fallbackContentRef } from '~/utils/fallback-content-ref';
import { placeholderColorClass } from '~/utils/placeholder-color-class';

/** The app runs installed, in its own window without browser controls. */
const isInstalledApp = () => window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && navigator.standalone === true);

/** An upload button shows when the cover area is hovered or the button has keyboard focus; a phone or a touch screen, with no hover, always shows it. */
const revealOnCoverHover =
  'opacity-0 transition-opacity duration-300 pointer-coarse:opacity-100 max-sm:opacity-100 focus-visible:opacity-100 group-hover/cover:opacity-100';

/** Frosted fill of an upload button, the same as the bar behind the name. */
const frostedButton = 'bg-background/50 backdrop-blur-xs hover:bg-background/75 dark:bg-background/75';

export function AccountSheet() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const isSystemAdmin = useUserStore((state) => state.isSystemAdmin);
  const isMobile = useBreakpointBelow('sm', false);
  const isOnline = useOnlineManager();

  const router = useRouter();
  const queryClient = useQueryClient();
  const { mutate: updateUser } = useUpdateUser(user.id);

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

  const profileLabel = t('c:view_resource', { resource: t('c:profile') });
  const coverLabel = t(user.bannerUrl ? 'c:change_resource' : 'c:upload_resource', { resource: t('c:cover') });
  const pictureLabel = t(user.thumbnailUrl ? 'c:change_resource' : 'c:upload_resource', { resource: t('c:profile_picture') });

  const uploadCover = () =>
    openImageUpload({
      templateId: 'cover',
      title: coverLabel,
      onUploaded: (bannerUrl) => updateUser({ bannerUrl }, { onSuccess: () => toaster.success(t('c:success.upload_cover')) }),
      onDelete: user.bannerUrl
        ? () => updateUser({ bannerUrl: null }, { onSuccess: () => toaster.success(t('c:success.delete_resource', { resource: t('c:cover') })) })
        : undefined,
    });

  const uploadPicture = () =>
    openImageUpload({
      templateId: 'avatar',
      title: pictureLabel,
      onUploaded: (thumbnailUrl) =>
        updateUser({ thumbnailUrl }, { onSuccess: () => toaster.success(t('c:success.update_resource', { resource: t('c:profile_picture') })) }),
      onDelete: user.thumbnailUrl
        ? () =>
            updateUser(
              { thumbnailUrl: null },
              { onSuccess: () => toaster.success(t('c:success.delete_resource', { resource: t('c:profile_picture') })) },
            )
        : undefined,
    });

  return (
    <NavSheetFrame ref={frameRef} panels>
      <h2 className="sr-only">{t('c:account')}</h2>
      <div className="group/cover relative">
        <button
          type="button"
          tabIndex={-1}
          aria-label={profileLabel}
          onClick={openProfile}
          className={cn(
            'block h-56 w-full bg-center bg-cover transition-colors duration-300 max-sm:h-44',
            !user.bannerUrl && placeholderColorClass(user.id),
          )}
          style={user.bannerUrl ? { backgroundImage: `url(${user.bannerUrl})` } : {}}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-22 bg-background/50 px-3 pt-12.5 text-center backdrop-blur-xs dark:bg-background/75">
          {/* The avatar rises by half its size to sit centered on the bar's edge */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={hasStarted ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <EntityAvatar className="size-20 ring-4 ring-black/10" type="user" id={user.id} name={user.name} url={user.thumbnailUrl} />
            </motion.div>
            {appConfig.has.uploadEnabled && (
              <Button
                variant="outline-ghost"
                size="icon"
                aria-label={pictureLabel}
                onClick={uploadPicture}
                className={cn('pointer-events-auto absolute -right-1 -bottom-1 size-7 rounded-full max-sm:size-8', frostedButton, revealOnCoverHover)}
              >
                <CameraIcon className="size-3.5" />
              </Button>
            )}
          </div>
          <p className="max-w-full truncate font-semibold text-base">{user.name}</p>
        </div>
        {appConfig.has.uploadEnabled && (
          <Button
            variant="outline-ghost"
            size="xs"
            onClick={uploadCover}
            className={cn('absolute top-2.5 right-2.5 max-sm:size-10', frostedButton, revealOnCoverHover)}
          >
            <ImageUpIcon />
            <span className="max-sm:sr-only">{coverLabel}</span>
          </Button>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-1 px-3">
        <NavSheetRow icon={UserRoundIcon} id="btn-profile" label={profileLabel} onClick={openProfile} />
        <NavSheetRow isOnline={isOnline} icon={SettingsIcon} id="btn-account" label={t('c:account_settings')} to="/account" />
        {isSystemAdmin && <NavSheetRow isOnline={isOnline} icon={WrenchIcon} id="btn-system" label={t('c:system_panel')} to="/system" />}
        {isInstalledApp() && <NavSheetRow icon={RefreshCwIcon} id="btn-refresh" label={t('c:refresh')} onClick={refresh} />}
        <NavSheetRow isOnline={isOnline} icon={LogOutIcon} id="btn-signout" label={t('c:sign_out')} to="/auth/sign-out" destructive />
      </div>
    </NavSheetFrame>
  );
}
