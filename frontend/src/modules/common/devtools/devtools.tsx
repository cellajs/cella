import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useEffect } from 'react';
import { create } from 'zustand';
import { SyncDevtools } from '~/modules/common/devtools/sync-devtools';
import { queryClient } from '~/query/query-client';
import { router } from '~/routes/router';

const reactScanKey = 'react-scan-enabled';

const useSyncDevtoolsStore = create<{ open: boolean }>(() => ({ open: false }));

/** Imported on demand so react-scan and its bundled Preact stay out of the eager chunk graph. */
const runScan = async (enabled: boolean) => {
  const { scan } = await import('react-scan');
  scan({ showToolbar: enabled, enabled });
};

/** Turns react-scan on or off; the choice holds across reloads. */
export function toggleReactScan() {
  const enable = localStorage.getItem(reactScanKey) !== 'true';
  localStorage.setItem(reactScanKey, String(enable));
  void runScan(enable);
}

export function toggleSyncDevtools() {
  useSyncDevtoolsStore.setState((state) => ({ open: !state.open }));
}

/**
 * Devtools panels, mounted once at the root, not next to the `DebugDropdown` that toggles them: inside a sheet, the
 * drawer's transform would contain their fixed-position panels and add blank scroll to it.
 */
export function Devtools() {
  const syncDevtoolsOpen = useSyncDevtoolsStore((state) => state.open);

  useEffect(() => {
    if (localStorage.getItem(reactScanKey) === 'true') void runScan(true);
  }, []);

  return (
    <>
      <TanStackRouterDevtools router={router} />
      <ReactQueryDevtools client={queryClient} />
      {syncDevtoolsOpen && <SyncDevtools onClose={() => useSyncDevtoolsStore.setState({ open: false })} />}
    </>
  );
}
