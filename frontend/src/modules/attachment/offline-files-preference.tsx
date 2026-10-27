import { HardDriveDownloadIcon, SettingsIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultOfflineFilesTier, offlineFilesRules, useOfflineFilesStore } from '~/modules/attachment/offline/offline-files-store';
import { isAlmostFull, percentFull, useOfflineFootprint } from '~/modules/attachment/offline/use-offline-footprint';
import { OfflineFilesSetting } from '~/modules/attachment/offline-files-setting';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { PreferenceRow, PreferencesGroup } from '~/modules/navigation/panels/preferences-group';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

/** The offline group of the preferences panel: how full this device's offline files are, and a button that opens the setting. */
export function OfflineFilesPreference() {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tier = useOfflineFilesStore((state) => state.tier) ?? defaultOfflineFilesTier();
  const footprint = useOfflineFootprint();
  const { budget } = offlineFilesRules(tier);
  const label = t('c:offline_files');

  const openSetting = () =>
    dialoger.getState().create(<OfflineFilesSetting />, {
      id: 'offline-files',
      triggerRef,
      className: 'md:max-w-2xl',
      title: label,
      description: t('c:offline_files.text'),
    });

  return (
    <PreferencesGroup title={t('c:offline')} help className="pb-8">
      <PreferenceRow icon={HardDriveDownloadIcon} label={label} description={t('c:offline_files.text')}>
        {footprint && (
          <Badge variant={isAlmostFull(footprint.bytes, budget) ? 'destructive' : 'secondary'}>
            {budget ? t('c:offline_files.percent_full', { percent: percentFull(footprint.bytes, budget) }) : t('c:offline_files.off')}
          </Badge>
        )}
        <Button
          ref={triggerRef}
          variant="ghost"
          size="xs"
          className="size-8 px-0"
          aria-haspopup="dialog"
          aria-label={t('c:edit_resource', { resource: label.toLowerCase() })}
          onClick={openSetting}
        >
          <SettingsIcon />
        </Button>
      </PreferenceRow>
    </PreferencesGroup>
  );
}

/** A red dot after the closed preferences panel's label while this device's offline files are almost full. */
export function OfflineFilesIndicator() {
  const { t } = useTranslation();
  const tier = useOfflineFilesStore((state) => state.tier) ?? defaultOfflineFilesTier();
  const footprint = useOfflineFootprint();

  if (!footprint || !isAlmostFull(footprint.bytes, offlineFilesRules(tier).budget)) return null;
  return <span role="img" aria-label={t('c:offline_files.almost_full')} className="size-2 rounded-full bg-destructive" />;
}
