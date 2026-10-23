import i18n from 'i18next';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';

/** The device runs low on storage below this much free space, or past `storageLowUsedRatio` of its quota. */
const storageLowFreeBytes = 100 * 1024 * 1024;
const storageLowUsedRatio = 0.9;

const warnedKey = `${appConfig.slug}:storage-low-warned`;
let warnedHere = false;

/** True once this tab session showed the warning; a reload keeps it, so each boot's eviction does not repeat it. */
function hasWarned(): boolean {
  if (warnedHere) return true;
  try {
    return sessionStorage.getItem(warnedKey) === '1';
  } catch {
    return false;
  }
}

function markWarned() {
  warnedHere = true;
  try {
    sessionStorage.setItem(warnedKey, '1');
  } catch {
    // Storage blocked: the module flag holds it for this page.
  }
}

/** Whether an estimate says the device runs low on storage; unknown sizes are not low. */
function isStorageLow({ usage, quota }: StorageEstimate): boolean {
  if (usage === undefined || !quota) return false;
  return quota - usage < storageLowFreeBytes || usage / quota > storageLowUsedRatio;
}

/**
 * Runs after each eviction of stored documents: warns once per session when the device runs low on storage, or when
 * the stored documents reached their limits with nothing left to evict, since every one holds unsynced edits. Edits
 * stored here survive a closed tab only while there is room for them.
 */
export async function warnOnStoragePressure({ limitsReached = false }: { limitsReached?: boolean } = {}): Promise<void> {
  if (hasWarned()) return;
  let low = limitsReached;
  if (!low) {
    try {
      const estimate = await navigator.storage?.estimate?.();
      low = !!estimate && isStorageLow(estimate);
    } catch {
      return;
    }
  }
  if (!low || hasWarned()) return;
  markWarned();
  toaster.warning(i18n.t('c:storage_low.text'), { id: 'storage-low' });
}
