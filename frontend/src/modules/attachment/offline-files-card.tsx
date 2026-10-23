import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  defaultOfflineFilesTier,
  type OfflineFilesTier,
  offlineFilesRules,
  offlineFilesTiers,
  useOfflineFilesStore,
} from '~/modules/attachment/offline/offline-files-store';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { ToolCard } from '~/modules/common/tool-card';
import { Progress } from '~/modules/ui/progress';
import { Slider } from '~/modules/ui/slider';
import { getLocalUserDb } from '~/query/local-user-db';
import { formatBytes } from '~/utils/format-bytes';

const tierText = {
  off: { label: 'c:offline_files.off', text: 'c:offline_files.off.text' },
  previews: { label: 'c:offline_files.previews', text: 'c:offline_files.previews.text' },
  recent: { label: 'c:offline_files.recent', text: 'c:offline_files.recent.text' },
  all: { label: 'c:offline_files.all', text: 'c:offline_files.all.text' },
} as const satisfies Record<OfflineFilesTier, { label: string; text: string }>;

const lastIndex = offlineFilesTiers.length - 1;

/** Bytes the offline budget counts on this device, live while the card is open; null while signed out. */
function useOfflineBytes() {
  const [bytes, setBytes] = useState<number | null>(null);
  useEffect(() => {
    if (!getLocalUserDb()) return;
    const subscription = liveQuery(() => attachmentStorage.offlineUsage()).subscribe({
      next: (usage) => setBytes(usage.bytes),
      error: () => setBytes(null),
    });
    return () => subscription.unsubscribe();
  }, []);
  return bytes;
}

/** The offline files tier of this device: what it keeps, and how much of its budget is in use. */
export function OfflineFilesCard() {
  const { t } = useTranslation();
  const tier = useOfflineFilesStore((state) => state.tier) ?? defaultOfflineFilesTier();
  const setTier = useOfflineFilesStore((state) => state.setTier);
  const bytes = useOfflineBytes();
  const { budget } = offlineFilesRules(tier);

  const choose = (index: number) => {
    const next = offlineFilesTiers[index];
    if (!next || next === tier) return;
    setTier(next);
    // Asked when the user chooses to keep files: without it the browser may clear them under storage pressure.
    if (offlineFilesRules(next).files) void navigator.storage?.persist?.();
  };

  return (
    <ToolCard label="c:offline_files" description={t('c:offline_files.text')}>
      <div className="flex flex-col gap-3">
        <Slider
          value={offlineFilesTiers.indexOf(tier)}
          min={0}
          max={lastIndex}
          step={1}
          onValueChange={(value) => choose(Array.isArray(value) ? value[0] : value)}
          thumbProps={{ 'aria-label': t('c:offline_files'), getAriaValueText: (_, value) => t(tierText[offlineFilesTiers[value]].label) }}
        />
        {/* Each label sits under its slider stop; the outer two align to the track's ends */}
        <div className="relative h-5 text-muted-foreground text-xs" aria-hidden="true">
          {offlineFilesTiers.map((value, index) => (
            <span
              key={value}
              className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
              style={{ left: `${(index / lastIndex) * 100}%` }}
            >
              {t(tierText[value].label)}
            </span>
          ))}
        </div>
        <p className="text-sm">{t(tierText[tier].text, { budget: formatBytes(budget) })}</p>
        {bytes !== null && budget > 0 && (
          <div className="flex flex-col gap-1.5">
            <Progress value={Math.min(100, (bytes / budget) * 100)} />
            <p className="text-muted-foreground text-xs">{t('c:offline_files.usage', { used: formatBytes(bytes), budget: formatBytes(budget) })}</p>
          </div>
        )}
      </div>
    </ToolCard>
  );
}
