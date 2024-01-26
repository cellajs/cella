import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type {} from '@redux-devtools/extension';

import { immer } from 'zustand/middleware/immer';

interface DraftState {
  forms: Record<string, unknown>;

  setForm<T>(key: string, value: T): void;
  resetForm(key: string): void;
  getForm<T>(key: string): T | undefined;
}

export const useDraftStore = create<DraftState>()(
  immer(
    persist(
      (set, get) => ({
        forms: {},

        setForm<T>(key: string, value: T) {
          set((state) => {
            state.forms[key] = value;
          });
        },

        resetForm(key: string) {
          set((state) => {
            delete state.forms[key];
          });
        },

        getForm<T>(key: string): T | undefined {
          return get().forms[key] as T | undefined;
        },
      }),
      { name: `${config.slug}-draft`, storage: createJSONStorage(() => sessionStorage) },
    ),
  ),
);
