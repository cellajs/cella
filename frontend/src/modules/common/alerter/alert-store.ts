import { isRecord } from 'shared/utils/as-record';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import { idbKvStorage } from '~/query/idb-kv-storage';

interface AlertStoreState {
  /** Ids of the banners the user dismissed, which stay hidden. */
  alertsSeen: string[];
  /** Whether the last word from the server is that it is down; the offline alert follows the connection, in `useOfflineAlert`. */
  downAlert: boolean;

  /** Adds one id to `alertsSeen`. */
  setAlertSeen: (alertId: string) => void;
  setDownAlert: (downAlert: boolean) => void;
  /** Back to the initial state, on sign-out. */
  reset: () => void;
}

const initStore: Pick<AlertStoreState, 'alertsSeen' | 'downAlert'> = { downAlert: false, alertsSeen: [] };

/** The server's down alert and the dismissed banners. */
export const useAlertStore = create<AlertStoreState>()(
  devtools(
    immer(
      persist(
        (set, get) => ({
          ...initStore,
          setAlertSeen: (alertId) =>
            set((state) => {
              state.alertsSeen.push(alertId);
            }),
          setDownAlert: (downAlert) => {
            // Every API answer lands here, and each `set` writes the persisted store.
            if (downAlert === get().downAlert) return;

            set((state) => {
              state.downAlert = downAlert;
            });
          },
          reset: () => set((state) => ({ ...state, ...initStore }), true),
        }),
        {
          // Version 2 stores no down alert, so a reload never shows a stale one; the dismissed banners carry over.
          version: 2,
          migrate: (persisted) => ({ alertsSeen: isRecord(persisted) && Array.isArray(persisted.alertsSeen) ? persisted.alertsSeen : [] }),
          name: 'alerts',
          skipHydration: true,
          partialize: (state) => ({ alertsSeen: state.alertsSeen }),
          storage: createJSONStorage(() => idbKvStorage('alerts')),
        },
      ),
    ),
    { enabled: isDebugMode, name: 'alert store' },
  ),
);

export { useAlertStore as alertStore };
