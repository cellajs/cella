import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { getTools, resolvePlacementList } from '~/lib/placements';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { PreferenceSwitch, PreferencesGroup } from '~/modules/navigation/panels/preferences-group';
import { useUIStore } from '~/modules/ui/ui-store';

const slot = 'account.preferences';

/** The appearance switches, then a group per tool of the `account.preferences` slot. */
export function PreferencesContent() {
  const { t } = useTranslation();

  const keepOpenPreference = useNavigationStore((state) => state.keepOpenPreference);
  const setKeepOpenPreference = useNavigationStore((state) => state.setKeepOpenPreference);

  const mode = useUIStore((state) => state.mode);
  const setMode = useUIStore((state) => state.setMode);
  const contrast = useUIStore((state) => state.contrast);
  const setContrast = useUIStore((state) => state.setContrast);

  const { mutate: updateSelf } = useUpdateSelfMutation();
  const tools = resolvePlacementList(slot, getTools(slot));

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
      </PreferencesGroup>

      {tools.map((tool) => (
        <Suspense key={tool.id} fallback={null}>
          {tool.render(undefined)}
        </Suspense>
      ))}
    </>
  );
}

/** The indicators of the `account.preferences` slot's tools, for the closed panel's toggle. */
export function PreferencesIndicators() {
  return resolvePlacementList(slot, getTools(slot)).map(
    (tool) =>
      tool.indicator && (
        <Suspense key={tool.id} fallback={null}>
          {tool.indicator()}
        </Suspense>
      ),
  );
}
