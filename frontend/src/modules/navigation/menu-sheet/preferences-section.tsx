import { InfoIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { OfflineAccessSwitch } from '~/modules/navigation/menu-sheet/offline-access-switch';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Switch } from '~/modules/ui/switch';
import { useUIStore } from '~/modules/ui/ui-store';

const pwaEnabled = appConfig.has.pwa;

export function PreferencesContent() {
  const { t } = useTranslation();

  const keepOpenPreference = useNavigationStore((state) => state.keepOpenPreference);
  const detailedMenu = useNavigationStore((state) => state.detailedMenu);
  const toggleDetailedMenu = useNavigationStore((state) => state.toggleDetailedMenu);
  const toggleKeepOpenPreference = useNavigationStore((state) => state.toggleKeepOpenPreference);
  const keyboardShortcuts = useNavigationStore((state) => state.keyboardShortcuts);
  const toggleKeyboardShortcuts = useNavigationStore((state) => state.toggleKeyboardShortcuts);

  const showDesktopMenuOption = appConfig.menuStructure.some(({ subentityType }) => subentityType);

  const mode = useUIStore((state) => state.mode);
  const setMode = useUIStore((state) => state.setMode);
  const keepMessages = useUIStore((state) => state.keepMessages);
  const setKeepMessages = useUIStore((state) => state.setKeepMessages);
  const contrast = useUIStore((state) => state.contrast);
  const setContrast = useUIStore((state) => state.setContrast);

  const { mutate: updateSelf } = useUpdateSelfMutation();

  // Applied before the round trip, so the page answers the switch at once; the column is what makes it follow the user.
  const toggleContrast = (checked: boolean) => {
    const next = checked ? 'more' : 'system';
    setContrast(next);
    updateSelf({ contrast: next });
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 pt-3">
        <h3 className="px-3 font-medium text-muted-foreground text-sm lowercase">{t('c:appearance')}</h3>

        <div className="flex items-center gap-3 px-3">
          <Switch
            size="sm"
            id="darkMode"
            checked={mode === 'dark'}
            onCheckedChange={(checked) => setMode(checked ? 'dark' : 'light')}
            aria-label={t('c:dark_mode')}
          />
          <label htmlFor="darkMode" className="cursor-pointer select-none text-sm leading-none">
            {t('c:dark_mode')}
          </label>
        </div>

        <div className="flex items-center gap-3 px-3">
          <Switch
            size="sm"
            id="increaseContrast"
            checked={contrast === 'more'}
            onCheckedChange={toggleContrast}
            aria-label={t('c:increase_contrast')}
          />
          <label htmlFor="increaseContrast" className="cursor-pointer select-none text-sm leading-none">
            {t('c:increase_contrast')}
          </label>
        </div>

        {/* Shown from 2xl only: below it the nav sheet never pins (see `isDesktop` in app-nav). */}
        <div className="flex items-center gap-3 px-3 max-2xl:hidden">
          <Switch
            size="sm"
            id="keepNavOpen"
            checked={keepOpenPreference}
            onCheckedChange={(checked) => toggleKeepOpenPreference(checked)}
            aria-label={t('c:keep_nav_open')}
          />
          <label htmlFor="keepNavOpen" className="cursor-pointer select-none text-sm leading-none">
            {t('c:keep_nav_open')}
          </label>
        </div>
        {showDesktopMenuOption && (
          <div className="flex items-center gap-3 px-3">
            <Switch size="sm" id="detailedMenu" checked={detailedMenu} onCheckedChange={toggleDetailedMenu} aria-label={t('c:detailed_menu')} />
            <label htmlFor="detailedMenu" className="cursor-pointer select-none text-sm leading-none">
              {t('c:detailed_menu')}
            </label>
          </div>
        )}
        <div className="flex items-center gap-3 px-3">
          <Switch
            size="sm"
            id="keyboardShortcuts"
            checked={keyboardShortcuts}
            onCheckedChange={toggleKeyboardShortcuts}
            aria-label={t('c:keyboard_shortcuts')}
          />
          <label htmlFor="keyboardShortcuts" className="cursor-pointer select-none text-sm leading-none">
            {t('c:keyboard_shortcuts')}
          </label>
        </div>
        <div className="flex items-center gap-3 px-3">
          <Switch size="sm" id="keepMessages" checked={keepMessages} onCheckedChange={setKeepMessages} aria-label={t('c:keep_messages')} />
          <label htmlFor="keepMessages" className="cursor-pointer select-none text-sm leading-none">
            {t('c:keep_messages')}
          </label>
        </div>
      </div>

      {pwaEnabled && (
        <div className="flex flex-col gap-4 pb-8">
          <h3 className="px-3 font-medium text-muted-foreground text-sm lowercase">{t('c:offline')}</h3>
          <OfflineAccessSwitch />
          <AlertBanner id="offline_access" animate variant="plain" icon={InfoIcon}>
            {t('c:offline_access.text')}
          </AlertBanner>
        </div>
      )}
    </>
  );
}
