import i18n from 'i18next';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';

/** The device runs low on storage below this much free space, or past `STORAGE_LOW_USED_RATIO` of its quota. */
export const STORAGE_LOW_FREE_BYTES = 100 * 1024 * 1024;
export const STORAGE_LOW_USED_RATIO = 0.9;

const WARNED_KEY = `${appConfig.slug}:storage-low-warned`;
let warnedHere = false;

/** True once this tab session showed the warning; a reload keeps it, so each boot's eviction does not repeat it. */
function warned(): boolean {
  if (warnedHere) return true;
  try {
    return sessionStorage.getItem(WARNED_KEY) === '1';
  } catch {
    return false;
  }
}

function markWarned() {
  warnedHere = true;
  try {
    sessionStorage.setItem(WARNED_KEY, '1');
  } catch {
    // Storage blocked: the module flag holds it for this page.
  }
}

/** Whether an estimate says the device runs low: under 100 MB free, or over 90% of the quota used. Unknown sizes are not low. */
export function isStorageLow({ usage, quota }: StorageEstimate): boolean {
  if (usage === undefined || !quota) return false;
  return quota - usage < STORAGE_LOW_FREE_BYTES || usage / quota > STORAGE_LOW_USED_RATIO;
}

/**
 * Runs after each eviction of stored documents: warns once per session when the device runs low on storage, or when
 * the stored documents reached their limits with nothing left to evict, since every one holds unsynced edits. Edits
 * stored here survive a closed tab only while there is room for them.
 */
export async function warnOnStoragePressure({ limitsReached = false }: { limitsReached?: boolean } = {}): Promise<void> {
  if (warned()) return;
  let low = limitsReached;
  if (!low) {
    try {
      const estimate = await navigator.storage?.estimate?.();
      low = !!estimate && isStorageLow(estimate);
    } catch {
      return;
    }
  }
  if (!low || warned()) return;
  markWarned();
  toaster.warning(i18n.t('c:storage_low.text'), { id: 'storage-low' });
}
