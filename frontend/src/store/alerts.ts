import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface AlertsState {
  alertsSeen: string[];
  setAlertSeen: (alertSeen: string) => void;
}

export const useAlertsStore = create<AlertsState>()(
  devtools(
    immer(
      persist(
        (set) => ({
          alertsSeen: [],
          setAlertSeen: (alertSeen) => {
            set((state) => {
              state.alertsSeen.push(alertSeen);
            });
          },
        }),
        {
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
