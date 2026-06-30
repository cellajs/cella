import { appConfig } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import { idbKvStorage } from '~/query/idb-kv-storage';
import { awaitRecovery, forceOnline } from '~/query/offline/connectivity';

export type AlertKeys = 'offline' | 'backend_not_ready' | 'maintenance' | 'auth_unavailable';

// Alerts with higher priority should not be overwritten by lower ones
const alertPriority: Record<AlertKeys, number> = {
  maintenance: 3,
  backend_not_ready: 2,
  auth_unavailable: 1,
  offline: 0,
};

interface AlertStoreState {
  alertsSeen: string[]; // Seen alert IDs (to prevent duplicate notifications)
  downAlert: AlertKeys | null; // Down alert type

  setAlertSeen: (alertSeen: string) => void; // Adds an alert to the seen list
  resetAlertSeen: (alertSeen: string[]) => void; // Resets seen alerts to a new array
  setDownAlert: (downLevel: AlertKeys | null) => void; // Sets the current down alert type
  clearAlertStore: () => void; // Resets to initial state
}

// Module-level abort controller for recovery polling
let recoveryController: AbortController | null = null;

const cancelRecovery = () => {
  recoveryController?.abort();
  recoveryController = null;
};

// Initial store state, using config to determine maintenance mode
const initStore: Pick<AlertStoreState, 'alertsSeen' | 'downAlert'> = {
  downAlert: appConfig.maintenance ? 'maintenance' : null,
  alertsSeen: [],
};

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
          setAlertSeen: (alertSeen) => {
            set((state) => {
              state.alertsSeen.push(alertSeen);
            });
          },
          setDownAlert: (alert) => {
            const current = get().downAlert;
            // Skip if already set to same value (prevents recovery restart loops)
            if (current === alert) return;

            // Don't let a lower-priority alert overwrite a higher-priority one
            if (alert && current && alertPriority[alert] < alertPriority[current]) return;

            cancelRecovery();
            set((state) => {
              state.downAlert = alert;
            });

            // Auto-recovery: poll /health for recoverable alerts
            if (alert === 'offline' && navigator.onLine) {
              recoveryController = new AbortController();
              awaitRecovery({ signal: recoveryController.signal, factor: 1 }).then((recovered) => {
                if (recovered && !recoveryController?.signal.aborted) forceOnline();
              });
            } else if (alert === 'backend_not_ready') {
              recoveryController = new AbortController();
              awaitRecovery({ signal: recoveryController.signal, factor: 1 }).then((recovered) => {
                if (recovered && !recoveryController?.signal.aborted) {
                  set((state) => {
                    state.downAlert = null;
                  });
                }
              });
            }
          },
          resetAlertSeen: (alertsSeen) => {
            set((state) => {
              state.alertsSeen = alertsSeen;
            });
          },
          clearAlertStore: () => {
            cancelRecovery();
            set((state) => ({ ...state, ...initStore }), true);
          },
        }),
        {
          version: 1,
          name: 'alerts',
          skipHydration: true,
          partialize: (state) => ({
            alertsSeen: state.alertsSeen,
            downAlert: state.downAlert,
          }),
          storage: createJSONStorage(() => idbKvStorage('alerts')),
        },
      ),
    ),
    { enabled: isDebugMode, name: 'alert store' },
  ),
);
