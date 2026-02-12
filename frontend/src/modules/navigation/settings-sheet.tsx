import { InfoIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AlertWrap } from '~/modules/common/alert-wrap';
import { OfflineAccessSwitch } from '~/modules/navigation/menu-sheet/offline-access-switch';
import { Switch } from '~/modules/ui/switch';
import { useNavigationStore } from '~/store/navigation';
import { cn } from '~/utils/cn';

const pwaEnabled = appConfig.has.pwa;

/**
 * Settings sheet content for navigation preferences.
 */
export const SettingsSheet = () => {
  const { t } = useTranslation();
  const isDesktop = useBreakpoints('min', 'xl', true);

  const keepOpenPreference = useNavigationStore((state) => state.keepOpenPreference);
  const detailedMenu = useNavigationStore((state) => state.detailedMenu);
  const toggleDetailedMenu = useNavigationStore((state) => state.toggleDetailedMenu);
  const toggleKeepOpenPreference = useNavigationStore((state) => state.toggleKeepOpenPreference);

  const showDesktopMenuOption = appConfig.menuStructure.some(({ subentityType }) => subentityType);

  return (
    <div className="w-full py-3 px-3 min-h-[calc(100vh-0.5rem)] flex flex-col">
      <h2 className="text-lg font-semibold mb-4 px-2 py-1.5">{t('common:usage_settings')}</h2>

      {/* Menu settings */}
      <div className={cn('flex flex-col gap-4 mx-2 mb-6', !showDesktopMenuOption && 'max-xl:hidden')}>
        <h3 className="text-sm font-medium text-muted-foreground/70 lowercase">{t('common:menu')}</h3>
        <div className="max-xl:hidden flex items-center gap-4 ml-1">
          <Switch
            id="keepMenuOpen"
            checked={keepOpenPreference}
            onCheckedChange={(checked) => toggleKeepOpenPreference(checked, isDesktop)}
            aria-label={t('common:keep_menu_open')}
          />
          <label htmlFor="keepMenuOpen" className="cursor-pointer select-none text-sm font-medium leading-none">
            {t('common:keep_menu_open')}
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

      {/* Offline settings */}
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
    </div>
  );
};
