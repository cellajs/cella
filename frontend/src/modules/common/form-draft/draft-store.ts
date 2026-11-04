import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { idbKvStorage } from '~/query/idb-kv-storage';

interface DraftStoreState {
  /** Draft values by form id, untyped: a draft restored from disk may predate its form's current fields. */
  forms: Record<string, Record<string, unknown>>;
  /** The ids of forms with unsaved changes; a clean form has no entry. */
  dirtyForms: Record<string, boolean>;

  setForm(key: string, values: Record<string, unknown>): void;
  /** Removes the form's draft and its dirty flag. */
  resetForm(key: string): void;
  getForm(key: string): Record<string, unknown> | undefined;
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
        setForm: (key, values) => {
          set((state) => {
            state.forms[key] = values;
          });
        },
        resetForm: (key: string) => {
          set((state) => {
            delete state.forms[key];
            delete state.dirtyForms[key];
          });
        },
        getForm: (key) => get().forms[key],
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
