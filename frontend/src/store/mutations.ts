import type { QueryKey } from '@tanstack/react-query';
import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface PausedMutation {
  mutationKey: QueryKey;
  variables: unknown;
  context: unknown;
}

interface MutationsStoreState {
  pausedMutations: PausedMutation[];

  setPausedMutations(mutation: PausedMutation): void;
  getPausedMutations(): PausedMutation[];
  clearPausedMutations(): void;
}

export const useMutationsStore = create<MutationsStoreState>()(
  immer(
    persist(
      (set, get) => ({
        pausedMutations: [],

        // Append new mutation while ensuring immer handles immutable mutationKey correctly
        setPausedMutations: (mutation) => {
          set((state) => {
            state.pausedMutations.push({
              mutationKey: [...mutation.mutationKey], // Avoid readonly issue
              variables: mutation.variables,
              context: mutation.context,
            });
          });
        },

        getPausedMutations: () => get().pausedMutations,

        clearPausedMutations: () =>
          set((state) => {
            state.pausedMutations = [];
          }),
      }),
      { version: 1, name: `${config.slug}-mutations`, storage: createJSONStorage(() => sessionStorage) },
    ),
  ),
);
