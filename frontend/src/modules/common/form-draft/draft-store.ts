import { appConfig } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface DraftStoreState {
  forms: Record<string, unknown>; // Draft forms
  dirtyForms: Record<string, boolean>; // Tracks which forms have unsaved changes

  setForm<T>(key: string, value: T): void; // Saves or updates a form draft
  resetForm(key: string): void; // Removes a specific form draft
  getForm<T>(key: string): T | undefined; // Retrieves a specific form draft
  clearForms(): void; // Clears all stored drafts
  setFormDirty(key: string, dirty: boolean): void; // Marks a form as dirty or clean
  isFormDirty(key: string): boolean; // Checks if a form has unsaved changes
}

/**
 * Draft store for having auto draft functionality on forms that use useDraftForm.
 */
export const useDraftStore = create<DraftStoreState>()(
  immer(
    persist(
      (set, get) => ({
        forms: {},
        dirtyForms: {},
        setForm: <T>(key: string, value: T) => {
          set((state) => {
            state.forms[key] = value;
          });
        },
        resetForm: (key: string) => {
          set((state) => {
            delete state.forms[key];
            delete state.dirtyForms[key];
          });
        },
        getForm: <T>(key: string): T | undefined => get().forms[key] as T | undefined,
        clearForms: () => set({ forms: {}, dirtyForms: {} }),
        setFormDirty: (key: string, dirty: boolean) => {
          set((state) => {
            if (dirty) state.dirtyForms[key] = true;
            else delete state.dirtyForms[key];
          });
        },
        isFormDirty: (key: string) => !!get().dirtyForms[key],
      }),
      { version: 1, name: `${appConfig.slug}-drafts`, storage: createJSONStorage(() => sessionStorage) },
    ),
  ),
);
