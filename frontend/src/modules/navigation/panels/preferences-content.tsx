import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { OfflineAccessSwitch } from '~/modules/navigation/panels/offline-access-switch';
import { PreferenceSwitch, PreferencesGroup } from '~/modules/navigation/panels/preferences-group';
import { useUIStore } from '~/modules/ui/ui-store';

const pwaEnabled = appConfig.has.pwa;

export function PreferencesContent() {
  const { t } = useTranslation();

  const keepOpenPreference = useNavigationStore((state) => state.keepOpenPreference);
  const detailedMenu = useNavigationStore((state) => state.detailedMenu);
  const setDetailedMenu = useNavigationStore((state) => state.setDetailedMenu);
  const setKeepOpenPreference = useNavigationStore((state) => state.setKeepOpenPreference);

  const showDetailedMenuOption = appConfig.menuStructure.some(({ subentityType }) => subentityType);

  const mode = useUIStore((state) => state.mode);
  const setMode = useUIStore((state) => state.setMode);
  const contrast = useUIStore((state) => state.contrast);
  const setContrast = useUIStore((state) => state.setContrast);

  const { mutate: updateSelf } = useUpdateSelfMutation();

  // Applied before the round trip, so the page answers the switch at once; the column is what makes it follow the user.
  const handleContrastChange = (checked: boolean) => {
    const next = checked ? 'more' : 'system';
    setContrast(next);
    updateSelf({ contrast: next });
  };

  return (
    <>
      <PreferencesGroup title={t('c:appearance')} help className="mb-6 pt-3">
        <PreferenceSwitch
          id="darkMode"
          label={t('c:dark_mode')}
          description={t('c:dark_mode.text')}
          checked={mode === 'dark'}
          onCheckedChange={(checked) => setMode(checked ? 'dark' : 'light')}
        />
        <PreferenceSwitch
          id="increaseContrast"
          label={t('c:increase_contrast')}
          description={t('c:increase_contrast.text')}
          checked={contrast === 'more'}
          onCheckedChange={handleContrastChange}
        />
        {/* Shown from 2xl only: below it the nav sheet never pins (see `isDesktop` in app-nav). */}
        <PreferenceSwitch
          id="keepNavOpen"
          label={t('c:keep_nav_open')}
          description={t('c:keep_nav_open.text')}
          checked={keepOpenPreference}
          onCheckedChange={setKeepOpenPreference}
          className="max-2xl:hidden"
        />
        {showDetailedMenuOption && (
          <PreferenceSwitch
            id="detailedMenu"
            label={t('c:detailed_menu')}
            description={t('c:detailed_menu.text')}
            checked={detailedMenu}
            onCheckedChange={setDetailedMenu}
          />
        )}
      </PreferencesGroup>

      {pwaEnabled && (
        <PreferencesGroup title={t('c:offline')} help className="pb-8">
          <OfflineAccessSwitch />
        </PreferencesGroup>
      )}
    </>
  );
}
