import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// Down levels are specific categories of alerts for maintenance (503) or offline (no connection) status
type downLevels = 'maintenance' | 'offline' | null;

interface AlertsState {
  alertsSeen: string[];
  downAlert: downLevels;
  setAlertSeen: (alertSeen: string) => void;
  setDownAlert: (downLevel: downLevels) => void;
}

export const useAlertsStore = create<AlertsState>()(
  devtools(
    immer(
      persist(
        (set) => ({
          downAlert: null,
          alertsSeen: [],
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
        }),
        {
          version: 1,
          name: `${config.slug}-alerts-seen`,
          partialize: (state) => ({
            alertsSeen: state.alertsSeen,
          }),
          storage: createJSONStorage(() => localStorage),
        },
      ),
    ),
  ),
);
