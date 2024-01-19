import config from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface AlertsState {
  alertSeen: string;
  setAlertSeen: (alertSeen: string) => void;
}

export const useAlertsStore = create<AlertsState>()(
  devtools(
    immer(
      persist(
        (set) => ({
          alertSeen: 'none',
          setAlertSeen: (alertSeen) => {
            set((state) => {
              state.alertSeen = alertSeen;
            });
          },
        }),
        {
          name: `${config.slug}-alertSeen`,
          partialize: (state) => ({
            alertSeen: state.alertSeen,
          }),
          storage: createJSONStorage(() => localStorage),
        },
      ),
    ),
  ),
);
