/**
 * Stream offset persistence via Zustand.
 * Stores last-seen activity ID per organization to resume from last position on reconnect.
 */

import { appConfig } from 'config';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OffsetState {
  /** Map of orgId → last-seen offset (activity ID) */
  offsets: Record<string, string>;
}

interface OffsetActions {
  /** Get stored offset for an organization */
  getOffset: (orgId: string) => string | null;
  /** Update offset for an organization */
  setOffset: (orgId: string, offset: string) => void;
  /** Clear offset for an organization */
  clearOffset: (orgId: string) => void;
  /** Clear all offsets (e.g., on logout) */
  clearAll: () => void;
}

type OffsetStore = OffsetState & OffsetActions;

/**
 * Zustand store for stream offset persistence.
 * Persisted to localStorage via zustand/middleware.
 */
export const useOffsetStore = create<OffsetStore>()(
  persist(
    (set, get) => ({
      offsets: {},

      getOffset: (orgId) => get().offsets[orgId] ?? null,

      setOffset: (orgId, offset) =>
        set((state) => ({
          offsets: { ...state.offsets, [orgId]: offset },
        })),

      clearOffset: (orgId) =>
        set((state) => {
          const { [orgId]: _, ...rest } = state.offsets;
          return { offsets: rest };
        }),

      clearAll: () => set({ offsets: {} }),
    }),
    { name: `${appConfig.slug}-sync-offsets` },
  ),
);

// ═══════════════════════════════════════════════════════════════════════════
// Non-hook API for use outside React components
// ═══════════════════════════════════════════════════════════════════════════

/** Get the stored offset for an organization. Returns null if not stored. */
export const getStoredOffset = (orgId: string): string | null => useOffsetStore.getState().getOffset(orgId);

/** Update the stored offset for an organization. */
export const updateStoredOffset = (orgId: string, offset: string): void =>
  useOffsetStore.getState().setOffset(orgId, offset);

/** Clear stored offset for an organization. */
export const clearStoredOffset = (orgId: string): void => useOffsetStore.getState().clearOffset(orgId);

/** Clear all stored offsets. */
export const clearAllOffsets = (): void => useOffsetStore.getState().clearAll();
