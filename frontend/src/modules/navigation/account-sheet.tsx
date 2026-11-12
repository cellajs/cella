import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { ImageUpIcon, LogOutIcon, RefreshCwIcon, SettingsIcon, UserRoundIcon, WrenchIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { navSheetId, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { openImageUpload } from '~/modules/common/uploader/open-image-upload';
import { NavSheetFrame } from '~/modules/navigation/nav-sheet-frame';
import { NavSheetRow } from '~/modules/navigation/nav-sheet-row';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { ProfilePictureButton } from '~/modules/user/profile-picture-button';
import { useUpdateUser } from '~/modules/user/query';
import { useCurrentUser, useUserStore } from '~/modules/user/user-store';
import { cn } from '~/utils/cn';
import { fallbackContentRef } from '~/utils/fallback-content-ref';
import { placeholderCoverClass } from '~/utils/placeholder-color-class';

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

  useEffect(() => {
    // Signing out from here shows its page at once, on a slow connection too
    void router.preloadRoute({ to: '/auth/sign-out' }).catch(() => {});
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

  const uploadCover = () =>
    openImageUpload({
      templateId: 'banner',
      title: coverLabel,
      onUploaded: (bannerUrl) => updateUser({ bannerUrl }, { onSuccess: () => toaster.success(t('c:success.upload_cover')) }),
      onDelete: user.bannerUrl
        ? () => updateUser({ bannerUrl: null }, { onSuccess: () => toaster.success(t('c:success.delete_resource', { resource: t('c:cover') })) })
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
          className={cn('block h-40 w-full bg-cover bg-center transition-colors duration-300', !user.bannerUrl && placeholderCoverClass(user.id))}
          style={user.bannerUrl ? { backgroundImage: `url(${user.bannerUrl})` } : {}}
        />
        {/* Cover and bar line up with a page header without an uploaded cover */}
        <div className="bg-background/50 dark:bg-background/75 pointer-events-none absolute inset-x-0 bottom-0 h-16 px-3 pt-7 text-center backdrop-blur-xs">
          <div className="absolute -top-15 left-1/2 -translate-x-1/2">
            {/* Pops in once the sheet has landed */}
            <div className="transition-[opacity,scale] delay-200 duration-300 ease-out starting:opacity-0 motion-safe:starting:scale-80">
              <EntityAvatar className="size-20 ring-4 ring-black/10" type="user" id={user.id} name={user.name} url={user.thumbnailUrl} />
            </div>
            <ProfilePictureButton user={user} className={revealOnCoverHover} />
          </div>
          <p className="max-w-full truncate text-base font-semibold">{user.name}</p>
        </div>
        {appConfig.has.uploads && (
          <TooltipButton toolTipContent={coverLabel} side="left">
            <Button
              variant="outline-ghost"
              size="icon-xs"
              onClick={uploadCover}
              className={cn('absolute top-4 right-4 max-sm:size-10', frostedButton, revealOnCoverHover)}
            >
              <ImageUpIcon />
            </Button>
          </TooltipButton>
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
