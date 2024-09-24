import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

type NetworkMode = 'online' | 'offline';

interface GeneralState {
  networkMode: NetworkMode;
  setNetworkMode: (mode: NetworkMode) => void;
}

export const useGeneralStore = create<GeneralState>()(
  devtools(
    persist(
      immer((set) => ({
        networkMode: 'online',
        setNetworkMode: (mode) => {
          set((state) => {
            state.networkMode = mode;
          });
        },
      })),
      {
        version: 2,
        name: `${config.slug}-general`,
        partialize: (state) => ({
          networkMode: state.networkMode,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
