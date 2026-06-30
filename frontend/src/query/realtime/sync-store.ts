import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import { idbKvStorage } from '~/query/idb-kv-storage';

interface OrgSyncState {
  tenantId: string;
  seqs: Record<string, number>;
  contexts: Record<string, Record<string, number>>;
}

interface SyncStoreState {
  cursor: string | null;
  lastSyncAt: string | null;
  orgs: Record<string, OrgSyncState>;
  publicSeqs: Record<string, number>;

  setCursor: (cursor: string | null) => void;
  setLastSyncAt: (timestamp: string | null) => void;
  setOrgTenantId: (orgId: string, tenantId: string) => void;
  getOrgTenantId: (orgId: string) => string | null;
  setOrgSeq: (orgId: string, entityType: string, seq: number) => void;
  getOrgSeq: (orgId: string, entityType: string) => number;
  setContextSeq: (orgId: string, contextId: string, entityType: string, seq: number) => void;
  getContextSeq: (orgId: string, contextId: string, entityType: string) => number;
  setPublicSeq: (entityType: string, seq: number) => void;
  getPublicSeq: (entityType: string) => number;
  /** Build flat seqs map for the catchup API body (backward-compatible with backend) */
  getFlatSeqs: () => Record<string, number>;
  reset: () => void;
}

const initStore = {
  cursor: null as string | null,
  lastSyncAt: null as string | null,
  orgs: {} as Record<string, OrgSyncState>,
  publicSeqs: {} as Record<string, number>,
};

/** Ensure an org entry exists, creating it with defaults if needed. */
function ensureOrg(orgs: Record<string, OrgSyncState>, orgId: string, tenantId?: string): OrgSyncState {
  const existing = orgs[orgId];
  if (!existing) {
    const created: OrgSyncState = { tenantId: tenantId ?? '', seqs: {}, contexts: {} };
    orgs[orgId] = created;
    return created;
  }
  if (tenantId) existing.tenantId = tenantId;
  return existing;
}

/**
 * Sync store for offline sync state management.
 *
 * Data model:
 * - `orgs`: per-organization sync state (tenantId, entity seqs, child-context seqs)
 * - `publicSeqs`: per-entityType seqs for the public stream (unscoped)
 * - `cursor`, `lastSyncAt`: global sync metadata
 */
export const useSyncStore = create<SyncStoreState>()(
  devtools(
    persist(
      immer((set, get) => ({
        ...initStore,

        setCursor: (cursor) =>
          set((s) => {
            s.cursor = cursor;
          }),
        setLastSyncAt: (ts) =>
          set((s) => {
            s.lastSyncAt = ts;
          }),

        setOrgTenantId: (orgId, tenantId) =>
          set((s) => {
            ensureOrg(s.orgs, orgId, tenantId);
          }),
        getOrgTenantId: (orgId) => get().orgs[orgId]?.tenantId || null,

        setOrgSeq: (orgId, entityType, seq) =>
          set((s) => {
            ensureOrg(s.orgs, orgId).seqs[entityType] = seq;
          }),
        getOrgSeq: (orgId, entityType) => get().orgs[orgId]?.seqs[entityType] ?? 0,

        setContextSeq: (orgId, contextId, entityType, seq) =>
          set((s) => {
            const org = ensureOrg(s.orgs, orgId);
            org.contexts[contextId] ??= {};
            org.contexts[contextId][entityType] = seq;
          }),
        getContextSeq: (orgId, contextId, entityType) => get().orgs[orgId]?.contexts[contextId]?.[entityType] ?? 0,

        setPublicSeq: (entityType, seq) =>
          set((s) => {
            s.publicSeqs[entityType] = seq;
          }),
        getPublicSeq: (entityType) => get().publicSeqs[entityType] ?? 0,

        getFlatSeqs: () => {
          const { orgs, publicSeqs } = get();
          const flat: Record<string, number> = {};
          for (const [orgId, org] of Object.entries(orgs)) {
            for (const [et, seq] of Object.entries(org.seqs)) flat[`${orgId}:s:${et}`] = seq;
            for (const [ctxId, ctxSeqs] of Object.entries(org.contexts)) {
              for (const [et, seq] of Object.entries(ctxSeqs)) flat[`${ctxId}:s:${et}`] = seq;
            }
          }
          for (const [et, seq] of Object.entries(publicSeqs)) flat[et] = seq;
          return flat;
        },

        reset: () => set(() => initStore),
      })),
      {
        name: 'sync',
        skipHydration: true,
        storage: createJSONStorage(() => idbKvStorage('sync')),
        partialize: (state) => ({
          cursor: state.cursor,
          lastSyncAt: state.lastSyncAt,
          orgs: state.orgs,
          publicSeqs: state.publicSeqs,
        }),
      },
    ),
    { name: 'SyncStore', enabled: isDebugMode },
  ),
);

/** Get the current cursor value (for SSE reconnect). Returns 'now' if no cursor is set. */
export function getSyncCursor(): string {
  return useSyncStore.getState().cursor ?? 'now';
}
