import { MoonIcon, SunIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { getTools, resolvePlacementList } from '~/lib/placements';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { PreferenceSwitch, PreferencesGroup } from '~/modules/navigation/panels/preferences-group';
import { SegmentedControl, SegmentedControlItem } from '~/modules/ui/segmented-control';
import { useUIStore } from '~/modules/ui/ui-store';

const slot = 'account.preferences';

/** Light and dark as one choice; the moon fills while dark is picked. */
function ModeControl() {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);
  const setMode = useUIStore((state) => state.setMode);

  return (
    <SegmentedControl
      size="sm"
      aria-label={t('c:appearance')}
      value={mode}
      onValueChange={setMode}
      className="my-2 grid grid-cols-2 self-center rounded-full [--segment-px:--spacing(3)] *:rounded-full"
    >
      <SegmentedControlItem value="light">
        <SunIcon className="size-4" />
        {t('c:light')}
      </SegmentedControlItem>
      <SegmentedControlItem value="dark" className="group/mode">
        <MoonIcon className="size-4 group-data-checked/mode:fill-current" />
        {t('c:dark')}
      </SegmentedControlItem>
    </SegmentedControl>
  );
}

/** The appearance controls, then a group per tool of the `account.preferences` slot. */
export function PreferencesContent() {
  const { t } = useTranslation();

  const keepOpenPreference = useNavigationStore((state) => state.keepOpenPreference);
  const setKeepOpenPreference = useNavigationStore((state) => state.setKeepOpenPreference);

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
    <div className="flex flex-col gap-4 pt-3 pb-8">
      <PreferencesGroup title={t('c:appearance')}>
        <ModeControl />
        <PreferenceSwitch
          id="increaseContrast"
          label={t('c:increase_contrast')}
          checked={contrast === 'more'}
          onCheckedChange={handleContrastChange}
        />
        {/* Shown from 2xl only: below it the nav sheet never pins (see `isDesktop` in app-nav). */}
        <PreferenceSwitch
          id="keepNavOpen"
          label={t('c:keep_nav_open')}
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
    </div>
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
