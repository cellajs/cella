import { Meter } from '@base-ui/react/meter';
import { ChevronRightIcon, HardDriveDownloadIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultOfflineFilesTier, offlineFilesRules, useOfflineFilesStore } from '~/modules/attachment/offline/offline-files-store';
import { isAlmostFull, percentFull, useOfflineFootprint } from '~/modules/attachment/offline/use-offline-footprint';
import { OfflineFilesSetting, offlineFilesTierText } from '~/modules/attachment/offline-files-setting';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { StatusDot } from '~/modules/common/status-dot';
import { PreferencesGroup } from '~/modules/navigation/panels/preferences-group';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/** The offline group of the preferences panel: what this device stores with a button that opens the setting, then a meter of how full it is. */
export function OfflineFilesPreference() {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tier = useOfflineFilesStore((state) => state.tier) ?? defaultOfflineFilesTier();
  const footprint = useOfflineFootprint();
  const { budget } = offlineFilesRules(tier);
  const label = t('c:offline_files');
  const almostFull = !!footprint && isAlmostFull(footprint.bytes, budget);
  const percent = footprint && budget > 0 ? percentFull(footprint.bytes, budget) : undefined;

  const openSetting = () =>
    dialoger.getState().create(<OfflineFilesSetting />, {
      id: 'offline-files',
      triggerRef,
      className: 'md:max-w-2xl',
      title: label,
      description: t('c:offline_files.text'),
    });

  return (
    <PreferencesGroup title={t('c:offline')}>
      {/* The icon takes the switch column, so the label lines up with the switches; the percent sits under it beside the meter */}
      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3">
        <HardDriveDownloadIcon className="size-4 justify-self-center" />
        <span className="font-medium text-sm">{t(offlineFilesTierText[tier].store)}</span>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="xs"
          aria-haspopup="dialog"
          aria-label={t('c:change_resource', { resource: label })}
          onClick={openSetting}
          className="-mr-2 gap-0.5 pr-1 text-muted-foreground"
        >
          {t('c:change')}
          <ChevronRightIcon className="size-4" />
        </Button>
        {footprint && percent && (
          <Meter.Root
            value={Math.min(100, (footprint.bytes / budget) * 100)}
            aria-label={label}
            getAriaValueText={() => t('c:offline_files.percent_full', { percent })}
            className={cn('col-span-3 grid grid-cols-subgrid items-center text-muted-foreground', almostFull && 'text-destructive')}
          >
            <span aria-hidden="true" className="justify-self-center whitespace-nowrap text-xs tabular-nums">
              {percent}
            </span>
            <Meter.Track className="col-span-2 h-2 overflow-hidden rounded-full bg-muted">
              <Meter.Indicator className={cn('rounded-full bg-primary transition-[width] duration-500', almostFull && 'bg-destructive')} />
            </Meter.Track>
          </Meter.Root>
        )}
      </div>
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
