import { liveQuery } from 'dexie';
import i18n from 'i18next';
import { useEffect, useState } from 'react';
import { offlineFilesRules, offlineFilesTiers } from '~/modules/attachment/offline/offline-files-store';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { getLocalUserDb } from '~/query/local-user-db';

type OfflineFootprint = Awaited<ReturnType<typeof attachmentStorage.tierFootprint>>;

/** What this device stores for offline use against each tier, live while mounted; null while signed out. */
export function useOfflineFootprint() {
  const [footprint, setFootprint] = useState<OfflineFootprint | null>(null);
  useEffect(() => {
    if (!getLocalUserDb()) return;
    const rules = offlineFilesTiers.map(offlineFilesRules);
    const subscription = liveQuery(() => attachmentStorage.tierFootprint(rules)).subscribe({
      next: setFootprint,
      error: () => setFootprint(null),
    });
    return () => subscription.unsubscribe();
  }, []);
  return footprint;
}

/** From this share of its budget, the tier shows as almost full in the preferences panel. */
const almostFullRatio = 0.9;

/** Whether what is stored fills at least `almostFullRatio` of a budget; never for a tier without one. */
export const isAlmostFull = (bytes: number, budget: number) => budget > 0 && bytes >= budget * almostFullRatio;

/** How full a budget is, as a whole percentage of at least 1% once anything is stored. */
export const percentFull = (bytes: number, budget: number) => {
  const ratio = bytes > 0 ? Math.min(1, Math.max(0.01, bytes / budget)) : 0;
  return new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'percent', maximumFractionDigits: 0 }).format(ratio);
};
