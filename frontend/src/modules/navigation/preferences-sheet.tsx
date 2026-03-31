import { Link } from '@tanstack/react-router';
import { BookOpenIcon, InfoIcon, LifeBuoyIcon, MailIcon, XIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { handleAskForHelp } from '~/modules/common/error-helpers';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { FocusBridge, FocusTarget } from '~/modules/navigation/focus-bridge';
import { MenuSheet } from '~/modules/navigation/menu-sheet/menu-sheet';
import { OfflineAccessSwitch } from '~/modules/navigation/menu-sheet/offline-access-switch';
import { navSheetClassName } from '~/modules/navigation/nav-sheet-constants';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { Switch } from '~/modules/ui/switch';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';

const pwaEnabled = appConfig.has.pwa;

/**
 * Preferences sheet content for device-linked navigation, storage and appearance settings.
 * Also includes support links and other user preferences that don't fit elsewhere.
 */
export const PreferencesSheet = () => {
  const { t } = useTranslation();
  const supportRef = useRef<HTMLButtonElement | null>(null);
  const contactRef = useRef<HTMLButtonElement | null>(null);

  const keepOpenPreference = useNavigationStore((state) => state.keepOpenPreference);
  const detailedMenu = useNavigationStore((state) => state.detailedMenu);
  const toggleDetailedMenu = useNavigationStore((state) => state.toggleDetailedMenu);
  const toggleKeepOpenPreference = useNavigationStore((state) => state.toggleKeepOpenPreference);

  const showDesktopMenuOption = appConfig.menuStructure.some(({ subentityType }) => subentityType);

  const { mode, setMode } = useUIStore();
  const hasThemeColors = Object.keys(appConfig.theme.colors).length > 0;
  const setNavSheetOpen = useNavigationStore((state) => state.setNavSheetOpen);

  const backRef = useRef<HTMLButtonElement>(null);

  const goBackToMenu = () => {
    setNavSheetOpen('menu');
    useSheeter.getState().replace(<MenuSheet />, {
      id: 'nav-sheet',
      triggerRef: backRef,
      side: 'left',
      modal: false,
      disablePointerDismissal: true,
      className: navSheetClassName,
      skipAnimation: true,
      contentKey: 'menu',
      autoScrollOnDrag: 'vertical',
      onClose: () => setNavSheetOpen(null),
    });
  };

  return (
    <div className="w-full bg-card py-3 px-3 min-h-screen flex flex-col">
      <FocusTarget target="sheet" />
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold px-2">{t('common:preferences')}</h2>
        <Button
          ref={backRef}
          variant="ghost"
          size="icon"
          onClick={goBackToMenu}
          className="size-10 opacity-50 hover:opacity-100 transition-opacity"
          aria-label={t('common:close')}
        >
          <XIcon size={20} />
        </Button>
      </div>

      {/* Appearance */}
      <div
        className={cn('flex flex-col gap-4 mx-2 mb-6', !showDesktopMenuOption && !hasThemeColors && 'max-xl:hidden')}
      >
        <h3 className="text-sm font-medium text-muted-foreground/70 lowercase px-4">{t('common:appearance')}</h3>

        <div className="flex items-center gap-4 px-4">
          <Switch
            id="darkMode"
            checked={mode === 'dark'}
            onCheckedChange={(checked) => setMode(checked ? 'dark' : 'light')}
            aria-label={t('common:dark_mode')}
          />
          <label htmlFor="darkMode" className="cursor-pointer select-none text-sm font-medium leading-none">
            {t('common:dark_mode')}
          </label>
        </div>

        <div className="max-xl:hidden flex items-center gap-4 px-4">
          <Switch
            id="keepNavOpen"
            checked={keepOpenPreference}
            onCheckedChange={(checked) => toggleKeepOpenPreference(checked)}
            aria-label={t('common:keep_nav_open')}
          />
          <label htmlFor="keepNavOpen" className="cursor-pointer select-none text-sm font-medium leading-none">
            {t('common:keep_nav_open')}
          </label>
        </div>
        {showDesktopMenuOption && (
          <div className="flex items-center gap-4 px-4">
            <Switch
              id="detailedMenu"
              checked={detailedMenu}
              onCheckedChange={toggleDetailedMenu}
              aria-label={t('common:detailed_menu')}
            />
            <label htmlFor="detailedMenu" className="cursor-pointer select-none text-sm font-medium leading-none">
              {t('common:detailed_menu')}
            </label>
          </div>
        )}
      </div>

      {/* Offline */}
      {pwaEnabled && (
        <>
          <div className="flex flex-col gap-4 mx-2">
            <h3 className="text-sm font-medium text-muted-foreground/70 lowercase px-4">{t('common:offline')}</h3>
            <OfflineAccessSwitch />
            <AlertBanner id="offline_access" animate variant="plain" icon={InfoIcon}>
              {t('common:offline_access.text')}
            </AlertBanner>
          </div>
        </>
      )}

      {/* Support options */}
      <div className="flex flex-col gap-1 mt-auto mx-2 pt-6">
        <h3 className="text-sm font-medium text-muted-foreground/70 lowercase mb-2 px-4">{t('common:support')}</h3>
        <Button
          variant="ghost"
          size="lg"
          className="w-full justify-start text-left"
          render={<Link to="/docs" draggable="false" />}
        >
          <BookOpenIcon className="mr-2 size-4" aria-hidden="true" />
          {t('common:api_docs')}
        </Button>
        {appConfig.has.chatSupport && (
          <Button
            ref={supportRef}
            variant="ghost"
            size="lg"
            className="w-full justify-start text-left"
            onClick={() => handleAskForHelp(supportRef)}
          >
            <LifeBuoyIcon className="mr-2 size-4" aria-hidden="true" />
            {t('common:support')}
          </Button>
        )}
        <Button
          ref={contactRef}
          variant="ghost"
          size="lg"
          className="w-full justify-start text-left"
          onClick={() => contactFormHandler(contactRef)}
        >
          <MailIcon className="mr-2 size-4" aria-hidden="true" />
          {t('common:contact_us')}
        </Button>
      </div>
      {/* Keyboard-only skip links at end of sheet */}
      <div className="flex flex-col pt-3">
        <FocusBridge direction="to-content" className="focus:relative" />
        <FocusBridge direction="to-sidebar" className="focus:relative" />
      </div>
    </div>
  );
};
