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
  alertsSeen: string[]; // Seen alert IDs (to prevent duplicate notifications)
  downAlert: AlertKey | null; // Down alert type

  setAlertSeen: (alertId: string) => void; // Adds an alert to the seen list
  setDownAlert: (downAlert: AlertKey | null) => void; // Sets the current down alert type
  reset: () => void; // Resets in-memory state to initial (call on sign-out)
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
  awaitRecovery({ signal, factor: 1 }).then((recovered) => {
    if (recovered && !signal.aborted) onRecovered();
  });
};

const initStore: Pick<AlertStoreState, 'alertsSeen' | 'downAlert'> = { downAlert: appConfig.maintenance ? 'maintenance' : null, alertsSeen: [] };

/**
 * Store for app-wide alerts and UI specific alerts in `alertsSeen`.
 * Owns recovery lifecycle: when a recoverable alert is set, auto-polls /health.
 */
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

            // Auto-recovery: poll /health for recoverable alerts
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

// Non-hook alias for accessing store outside of React components / as a value (e.g. getState)
export { useAlertStore as alertStore };
