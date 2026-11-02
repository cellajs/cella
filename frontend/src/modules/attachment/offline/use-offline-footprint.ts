import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { liveQuery } from 'dexie';
import i18n from 'i18next';
import { useEffect } from 'react';
import { offlineFilesRules, offlineFilesTiers } from '~/modules/attachment/offline/offline-files-store';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { writeKeepingMark } from '~/query/basic/cache-mutations';
import { getLocalUserDb } from '~/query/local-user-db';
import { queryClient } from '~/query/query-client';

const readFootprint = async () => (getLocalUserDb() ? attachmentStorage.tierFootprint(offlineFilesTiers.map(offlineFilesRules)) : null);

/** Local data, kept current by the hook's live query; a failed read resolves to null, since the hook suspends on it. */
const footprintQueryOptions = queryOptions({
  queryKey: ['offlineFootprint'],
  queryFn: () => readFootprint().catch(() => null),
  meta: { persist: false },
});

/**
 * What this device stores for offline use against each tier, live while mounted; null while signed out. Suspends on the
 * first read, so a closed nav sheet panel, which runs no effects, has it before it opens.
 */
export function useOfflineFootprint() {
  const { data: footprint } = useSuspenseQuery(footprintQueryOptions);
  useEffect(() => {
    const { queryKey } = footprintQueryOptions;
    const subscription = liveQuery(readFootprint).subscribe({
      next: (next) => writeKeepingMark(queryClient, queryKey, () => next),
      error: () => writeKeepingMark(queryClient, queryKey, () => null),
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
