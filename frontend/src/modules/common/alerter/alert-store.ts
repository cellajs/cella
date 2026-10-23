import { appConfig } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import { idbKvStorage } from '~/query/idb-kv-storage';
import { awaitRecovery, forceOnline } from '~/query/offline/connectivity';

export type AlertKey = 'offline' | 'backend_not_ready' | 'maintenance' | 'auth_unavailable';

// Alerts with higher priority should not be overwritten by lower ones
const alertPriority: Record<AlertKey, number> = { maintenance: 3, backend_not_ready: 2, auth_unavailable: 1, offline: 0 };

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

let recoveryController: AbortController | null = null;

const cancelRecovery = () => {
  recoveryController?.abort();
  recoveryController = null;
};

/** Polls /health and runs `onRecovered` once it answers, unless a newer alert or a reset cancelled the poll first. */
const startRecovery = (onRecovered: () => void) => {
  recoveryController = new AbortController();
  const { signal } = recoveryController;
  awaitRecovery(signal).then((recovered) => {
    if (recovered && !signal.aborted) onRecovered();
  });
};

const initStore: Pick<AlertStoreState, 'alertsSeen' | 'downAlert'> = { downAlert: appConfig.maintenance ? 'maintenance' : null, alertsSeen: [] };

/** The current down alert and the dismissed banners; a recoverable down alert polls /health until it clears. */
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
            // Re-setting the same alert would restart recovery polling
            if (current === downAlert) return;

            if (downAlert && current && alertPriority[downAlert] < alertPriority[current]) return;

            cancelRecovery();
            set((state) => {
              state.downAlert = downAlert;
            });

            if (downAlert === 'offline' && navigator.onLine) startRecovery(forceOnline);
            else if (downAlert === 'backend_not_ready') {
              startRecovery(() =>
                set((state) => {
                  state.downAlert = null;
                }),
              );
            }
          },
          reset: () => {
            cancelRecovery();
            set((state) => ({ ...state, ...initStore }), true);
          },
        }),
        {
          version: 1,
          name: 'alerts',
          skipHydration: true,
          partialize: (state) => ({ alertsSeen: state.alertsSeen, downAlert: state.downAlert }),
          storage: createJSONStorage(() => idbKvStorage('alerts')),
        },
      ),
    ),
    { enabled: isDebugMode, name: 'alert store' },
  ),
);

export { useAlertStore as alertStore };
