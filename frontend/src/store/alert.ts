import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

type DownLevels = 'maintenance' | 'auth_unavailable' | 'offline' | null;

interface AlertStoreState {
  alertsSeen: string[]; // Seen alert IDs (to prevent duplicate notifications)
  downAlert: DownLevels; // Down alert type

  setAlertSeen: (alertSeen: string) => void; // Adds an alert to the seen list
  resetAlertSeen: (alertSeen: string[]) => void; // Resets seen alerts to a new array
  setDownAlert: (downLevel: DownLevels) => void; // Sets the current down alert type
  clearAlertStore: () => void; // Resets to initial state
}

// Initial store state, using config to determine maintenance mode
const initStore: Pick<AlertStoreState, 'alertsSeen' | 'downAlert'> = { downAlert: config.maintenance ? 'maintenance' : null, alertsSeen: [] };

export const useAlertStore = create<AlertStoreState>()(
  devtools(
    immer(
      persist(
        (set) => ({
          ...initStore,
          setAlertSeen: (alertSeen) => {
            set((state) => {
              state.alertsSeen.push(alertSeen);
            });
          },
          setDownAlert: (downLevel) => {
            set((state) => {
              state.downAlert = downLevel;
            });
          },
          resetAlertSeen: (alertsSeen) => {
            set((state) => {
              state.alertsSeen = alertsSeen;
            });
          },
          clearAlertStore: () => set((state) => ({ ...state, ...initStore }), true),
        }),
        {
          version: 1,
          name: `${config.slug}-alerts-seen`,
          partialize: (state) => ({
            alertsSeen: state.alertsSeen,
            downAlert: state.downAlert,
          }),
          storage: createJSONStorage(() => localStorage),
        },
      ),
    ),
  ),
);
