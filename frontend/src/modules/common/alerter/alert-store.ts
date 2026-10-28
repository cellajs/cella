import { appConfig } from 'shared';
import { isRecord } from 'shared/utils/as-record';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import { idbKvStorage } from '~/query/idb-kv-storage';

/** A down alert the server's answers set; the offline alert follows the connection, in `useOfflineAlert`. */
export type AlertKey = 'maintenance' | 'auth_unavailable';

// Alerts with higher priority should not be overwritten by lower ones
const alertPriority: Record<AlertKey, number> = { maintenance: 1, auth_unavailable: 0 };

interface AlertStoreState {
  /** Ids of the banners the user dismissed, which stay hidden. */
  alertsSeen: string[];
  downAlert: AlertKey | null;

  /** Adds one id to `alertsSeen`. */
  setAlertSeen: (alertId: string) => void;
  setDownAlert: (downAlert: AlertKey | null) => void;
  /** Back to the initial state, on sign-out. */
  reset: () => void;
}

const initStore: Pick<AlertStoreState, 'alertsSeen' | 'downAlert'> = { downAlert: appConfig.maintenance ? 'maintenance' : null, alertsSeen: [] };

/** The server's down alert and the dismissed banners. */
export const useAlertStore = create<AlertStoreState>()(
  devtools(
    immer(
      persist(
        (set, get) => ({
          ...initStore,
          setAlertSeen: (alertId) => {
            set((state) => {
              state.alertsSeen.push(alertId);
            });
          },
          setDownAlert: (downAlert) => {
            const current = get().downAlert;
            if (downAlert && current && alertPriority[downAlert] < alertPriority[current]) return;

            set((state) => {
              state.downAlert = downAlert;
            });
          },
          reset: () => {
            set((state) => ({ ...state, ...initStore }), true);
          },
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
