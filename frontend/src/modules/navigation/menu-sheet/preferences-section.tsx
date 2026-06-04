import { InfoIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AlertBanner } from '~/alerter/alert-banner';
import { OfflineAccessSwitch } from '~/modules/navigation/menu-sheet/offline-access-switch';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Switch } from '~/modules/ui/switch';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';

const pwaEnabled = appConfig.has.pwa;

/**
 * Preferences content: appearance toggles and offline settings.
 */
export const PreferencesContent = () => {
  const { t } = useTranslation();

  const keepOpenPreference = useNavigationStore((state) => state.keepOpenPreference);
  const detailedMenu = useNavigationStore((state) => state.detailedMenu);
  const toggleDetailedMenu = useNavigationStore((state) => state.toggleDetailedMenu);
  const toggleKeepOpenPreference = useNavigationStore((state) => state.toggleKeepOpenPreference);

  const showDesktopMenuOption = appConfig.menuStructure.some(({ subentityType }) => subentityType);

  const { mode, setMode } = useUIStore();
  const hasThemeColors = Object.keys(appConfig.theme.colors).length > 0;

  return (
    <>
      {/* Appearance */}
      <div
        className={cn('mb-6 flex flex-col gap-4 pt-3', !showDesktopMenuOption && !hasThemeColors && 'max-xl:hidden')}
      >
        <h3 className="px-4 font-medium text-muted-foreground/70 text-sm lowercase">{t('c:appearance')}</h3>

        <div className="flex items-center gap-4 px-4">
          <Switch
            id="darkMode"
            checked={mode === 'dark'}
            onCheckedChange={(checked) => setMode(checked ? 'dark' : 'light')}
            aria-label={t('c:dark_mode')}
          />
          <label htmlFor="darkMode" className="cursor-pointer select-none font-medium text-sm leading-none">
            {t('c:dark_mode')}
          </label>
        </div>

        <div className="flex items-center gap-4 px-4 max-xl:hidden">
          <Switch
            id="keepNavOpen"
            checked={keepOpenPreference}
            onCheckedChange={(checked) => toggleKeepOpenPreference(checked)}
            aria-label={t('c:keep_nav_open')}
          />
          <label htmlFor="keepNavOpen" className="cursor-pointer select-none font-medium text-sm leading-none">
            {t('c:keep_nav_open')}
          </label>
        </div>
        {showDesktopMenuOption && (
          <div className="flex items-center gap-4 px-4">
            <Switch
              id="detailedMenu"
              checked={detailedMenu}
              onCheckedChange={toggleDetailedMenu}
              aria-label={t('c:detailed_menu')}
            />
            <label htmlFor="detailedMenu" className="cursor-pointer select-none font-medium text-sm leading-none">
              {t('c:detailed_menu')}
            </label>
          </div>
        )}
      </div>

      {/* Offline */}
      {pwaEnabled && (
        <div className="flex flex-col gap-4 pb-8">
          <h3 className="px-4 font-medium text-muted-foreground/70 text-sm lowercase">{t('c:offline')}</h3>
          <OfflineAccessSwitch />
          <AlertBanner id="offline_access" animate variant="plain" icon={InfoIcon}>
            {t('c:offline_access.text')}
          </AlertBanner>
        </div>
      )}
    </>
  );
};
