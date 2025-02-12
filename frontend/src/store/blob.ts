import { config } from 'config';
import { enableMapSet } from 'immer';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

enableMapSet(); // Enable Immer support for Map & Set

interface BlobStoreState {
  blobUrls: Map<string, string>;

  getBlobUrl: (key: string) => string | undefined;
  setBlobUrl: (key: string, url: string) => void;
  revokeBlobUrl: (key: string) => void;
  clearAll: () => void;
}

export const useBlobStore = create<BlobStoreState>()(
  devtools(
    persist(
      immer((set, get) => ({
        blobUrls: new Map(), // Default state

        getBlobUrl: (key) => get().blobUrls.get(key),

        setBlobUrl: (key, url) => {
          set((state) => {
            state.blobUrls.set(key, url);
          });
        },

        revokeBlobUrl: (key) => {
          set((state) => {
            const url = state.blobUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            state.blobUrls.delete(key);
          });
        },

        clearAll: () => {
          set((state) => {
            for (const url of state.blobUrls.values()) {
              URL.revokeObjectURL(url);
            }
            state.blobUrls.clear();
          });
        },
      })),
      {
        version: 1,
        name: `${config.slug}-blobs`,
        storage: createJSONStorage(() => sessionStorage),
        partialize: (state) => ({
          blobUrls: Array.from(state.blobUrls.entries()), // Store as serializable array
        }),
        onRehydrateStorage: () => (state) => {
          if (state?.blobUrls && Array.isArray(state.blobUrls)) {
            state.blobUrls = new Map(state.blobUrls); // Convert back to Map
          }
        },
      },
    ),
  ),
);

// Cleanup Blob URLs when the tab closes
window.addEventListener('beforeunload', () => {
  useBlobStore.getState().clearAll();
});
