import { HardDriveDownloadIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultOfflineFilesTier, offlineFilesRules, useOfflineFilesStore } from '~/modules/attachment/offline/offline-files-store';
import { isAlmostFull, percentFull, useOfflineFootprint } from '~/modules/attachment/offline/use-offline-footprint';
import { OfflineFilesSetting, offlineFilesTierText } from '~/modules/attachment/offline-files-setting';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { StatusDot } from '~/modules/common/status-dot';
import { PreferenceButton, PreferencesGroup } from '~/modules/navigation/panels/preferences-group';
import { Badge } from '~/modules/ui/badge';
import { cn } from '~/utils/cn';
import { formatBytes } from '~/utils/format-bytes';

/** The offline group of the preferences panel: a button that opens the setting, with a meter of how full this device's offline files are. */
export function OfflineFilesPreference() {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tier = useOfflineFilesStore((state) => state.tier) ?? defaultOfflineFilesTier();
  const footprint = useOfflineFootprint();
  const { budget } = offlineFilesRules(tier);
  const label = t('c:offline_files');
  const almostFull = !!footprint && isAlmostFull(footprint.bytes, budget);

  const openSetting = () =>
    dialoger.getState().create(<OfflineFilesSetting />, {
      id: 'offline-files',
      triggerRef,
      className: 'md:max-w-2xl',
      title: label,
      description: t('c:offline_files.text'),
    });

  return (
    <PreferencesGroup title={t('c:offline')} className="pb-8">
      <PreferenceButton
        ref={triggerRef}
        icon={HardDriveDownloadIcon}
        label={label}
        onClick={openSetting}
        status={
          footprint && (
            <Badge variant={almostFull ? 'destructive' : 'secondary'} className={cn(!almostFull && 'group-hover/preference:bg-foreground/10')}>
              {budget ? t('c:offline_files.percent_full', { percent: percentFull(footprint.bytes, budget) }) : t('c:offline_files.off')}
            </Badge>
          )
        }
      >
        {footprint && budget > 0 && (
          <>
            <span aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-muted group-hover/preference:bg-foreground/10">
              <span
                className={cn('block h-full rounded-full bg-primary transition-[width] duration-500', almostFull && 'bg-destructive')}
                style={{ width: `${Math.min(100, (footprint.bytes / budget) * 100)}%` }}
              />
            </span>
            <span className="text-muted-foreground text-xs">
              {t('c:offline_files.tier_usage', {
                tier: t(offlineFilesTierText[tier].label),
                used: formatBytes(footprint.bytes),
                budget: formatBytes(budget),
              })}
            </span>
          </>
        )}
      </PreferenceButton>
    </PreferencesGroup>
  );
}

/** A red dot after the closed preferences panel's label while this device's offline files are almost full. */
export function OfflineFilesIndicator() {
  const { t } = useTranslation();
  const tier = useOfflineFilesStore((state) => state.tier) ?? defaultOfflineFilesTier();
  const footprint = useOfflineFootprint();

  if (!footprint || !isAlmostFull(footprint.bytes, offlineFilesRules(tier).budget)) return null;
  return <StatusDot variant="destructive" label={t('c:offline_files.almost_full')} />;
}
