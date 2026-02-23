import { Link } from '@tanstack/react-router';
import { BookOpenIcon, InfoIcon, LifeBuoyIcon, MailIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AlertWrap } from '~/modules/common/alert-wrap';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { handleAskForHelp } from '~/modules/common/error-notice';
import { OfflineAccessSwitch } from '~/modules/navigation/menu-sheet/offline-access-switch';
import { buttonVariants } from '~/modules/ui/button';
import { Switch } from '~/modules/ui/switch';
import { useNavigationStore } from '~/store/navigation';
import { cn } from '~/utils/cn';

const pwaEnabled = appConfig.has.pwa;

/**
 * Settings sheet content for navigation preferences.
 */
export const SettingsSheet = () => {
  const { t } = useTranslation();
  const supportRef = useRef<HTMLButtonElement | null>(null);
  const contactRef = useRef<HTMLButtonElement | null>(null);

  const keepOpenPreference = useNavigationStore((state) => state.keepOpenPreference);
  const detailedMenu = useNavigationStore((state) => state.detailedMenu);
  const toggleDetailedMenu = useNavigationStore((state) => state.toggleDetailedMenu);
  const toggleKeepOpenPreference = useNavigationStore((state) => state.toggleKeepOpenPreference);

  const showDesktopMenuOption = appConfig.menuStructure.some(({ subentityType }) => subentityType);

  return (
    <div className="w-full py-3 px-3 min-h-[calc(100vh-0.5rem)] flex flex-col">
      {/* Usage settings */}
      <h2 className="text-lg font-semibold mb-4 px-2 py-1.5">{t('common:usage_settings')}</h2>

      {/* Menu */}
      <div className={cn('flex flex-col gap-4 mx-2 mb-6', !showDesktopMenuOption && 'max-xl:hidden')}>
        <h3 className="text-sm font-medium text-muted-foreground/70 lowercase">{t('common:menu')}</h3>
        <div className="max-xl:hidden flex items-center gap-4 ml-1">
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
          <div className="flex items-center gap-4 ml-1">
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
            <h3 className="text-sm font-medium text-muted-foreground/70 lowercase">{t('common:offline')}</h3>
            <OfflineAccessSwitch />
            <AlertWrap id="offline_access" variant="plain" icon={InfoIcon}>
              {t('common:offline_access.text')}
            </AlertWrap>
          </div>
        </>
      )}

      {/* Support options */}
      <div className="flex flex-col gap-1 mt-auto mx-2 pt-6">
        <h3 className="text-sm font-medium text-muted-foreground/70 lowercase mb-2">{t('common:support')}</h3>
        <Link
          to="/docs"
          draggable="false"
          className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'w-full justify-start text-left')}
        >
          <BookOpenIcon className="mr-2 size-4" aria-hidden="true" />
          {t('common:api_docs')}
        </Link>
        {appConfig.gleapToken && (
          <button
            ref={supportRef}
            type="button"
            onClick={() => handleAskForHelp(supportRef)}
            className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'w-full justify-start text-left')}
          >
            <LifeBuoyIcon className="mr-2 size-4" aria-hidden="true" />
            {t('common:support')}
          </button>
        )}
        <button
          ref={contactRef}
          type="button"
          onClick={() => contactFormHandler(contactRef)}
          className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'w-full justify-start text-left')}
        >
          <MailIcon className="mr-2 size-4" aria-hidden="true" />
          {t('common:contact_us')}
        </button>
      </div>
    </div>
  );
};
