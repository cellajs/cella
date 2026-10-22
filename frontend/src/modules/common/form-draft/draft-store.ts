import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { idbKvStorage } from '~/query/idb-kv-storage';

interface DraftStoreState {
  /** Draft values by form id. */
  forms: Record<string, unknown>;
  /** The ids of forms with unsaved changes; a clean form has no entry. */
  dirtyForms: Record<string, boolean>;

  setForm<T>(key: string, value: T): void;
  /** Removes the form's draft and its dirty flag. */
  resetForm(key: string): void;
  getForm<T>(key: string): T | undefined;
  /** Clears the drafts in memory, on sign-out. */
  reset(): void;
  setFormDirty(key: string, dirty: boolean): void;
  isFormDirty(key: string): boolean;
}

const initStore: Pick<DraftStoreState, 'forms' | 'dirtyForms'> = { forms: {}, dirtyForms: {} };

/** Backs the auto-draft behavior of useFormWithDraft. */
export const useDraftStore = create<DraftStoreState>()(
  immer(
    persist(
      (set, get) => ({
        ...initStore,
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
        reset: () => set(initStore),
        setFormDirty: (key: string, dirty: boolean) => {
          set((state) => {
            if (dirty) state.dirtyForms[key] = true;
            else delete state.dirtyForms[key];
          });
        },
        isFormDirty: (key: string) => !!get().dirtyForms[key],
      }),
      { version: 1, name: 'drafts', skipHydration: true, storage: createJSONStorage(() => idbKvStorage('drafts')) },
    ),
  ),
);

export { useDraftStore as draftStore };
