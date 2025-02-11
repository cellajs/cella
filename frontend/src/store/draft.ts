import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface DraftState {
  forms: Record<string, unknown>; // Draft forms

  setForm<T>(key: string, value: T): void; // Saves or updates a form draft
  resetForm(key: string): void; // Removes a specific form draft
  getForm<T>(key: string): T | undefined; // Retrieves a specific form draft
  clearForms(): void; // Clears all stored drafts
}

export const useDraftStore = create<DraftState>()(
  immer(
    persist(
      (set, get) => ({
        forms: {},
        setForm: <T>(key: string, value: T) => {
          set((state) => {
            state.forms[key] = value;
          });
        },
        resetForm: (key: string) => {
          set((state) => {
            delete state.forms[key];
          });
        },
        getForm: <T>(key: string): T | undefined => get().forms[key] as T | undefined,
        clearForms: () => set({ forms: {} }),
      }),
      { version: 1, name: `${config.slug}-drafts`, storage: createJSONStorage(() => sessionStorage) },
    ),
  ),
);
