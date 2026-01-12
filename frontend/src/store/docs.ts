import { appConfig } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type DocsViewMode = 'list' | 'table';

interface DocsStoreState {
  viewMode: DocsViewMode; // Current view mode for docs
  setViewMode: (viewMode: DocsViewMode) => void; // Updates the view mode

  clearDocsStore: () => void; // Resets store to initial state
}

// Default state values
const initStore: Pick<DocsStoreState, 'viewMode'> = {
  viewMode: 'list',
};

/**
 * Docs store for persisted documentation preferences: view mode
 */
export const useDocsStore = create<DocsStoreState>()(
  devtools(
    persist(
      immer((set) => ({
        ...initStore,
        setViewMode: (viewMode) => {
          set((state) => {
            state.viewMode = viewMode;
          });
        },
        clearDocsStore: () =>
          set(() => ({
            viewMode: 'list',
          })),
      })),
      {
        version: 1,
        name: `${appConfig.slug}-docs`,
        partialize: (state) => ({
          viewMode: state.viewMode,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
