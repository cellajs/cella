import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface DocsStoreState {
  clearDocsStore: () => void; // Resets store to initial state
}

/**
 * Docs store for documentation state management.
 * Note: View mode is now handled via routes (/docs/operations vs /docs/operations/table)
 */
export const useDocsStore = create<DocsStoreState>()(
  devtools(
    immer((set) => ({
      clearDocsStore: () => set(() => ({})),
    })),
  ),
);
