import { useEffect } from 'react';
import { getLocalUserDb } from '~/query/local-user-db';
import { tabCoordinatorStore } from '~/query/realtime/tab-coordinator';

/** Shows a notice for each edit still parked, as the page loaded; the notice module loads only when there is one. */
async function showParkedNotices() {
  try {
    const records = (await getLocalUserDb()?.unsaveableYDocs.toArray()) ?? [];
    if (!records.length) return;
    const { showUnsaveableNotice } = await import('~/modules/common/blocknote/unsaveable-notices');
    await Promise.all(records.map((record) => showUnsaveableNotice(record)));
  } catch (error) {
    console.error('[yjs] Showing parked edits failed:', error);
  }
}

/**
 * Offers the edits that could never be saved again at boot, until the user copies or discards them. Only the leader
 * tab shows them, once the election settled, so several open tabs do not repeat them; a tab that parks edits later
 * shows its own notice.
 */
export function ParkedNoticesOnBoot() {
  useEffect(() => {
    let checked = false;
    const check = () => {
      const { isReady, isLeader } = tabCoordinatorStore.getState();
      if (!isReady || checked) return;
      checked = true;
      if (isLeader) void showParkedNotices();
    };
    const unsubscribe = tabCoordinatorStore.subscribe(check);
    check();
    return unsubscribe;
  }, []);

  return null;
}
