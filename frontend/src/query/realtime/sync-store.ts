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

  setCursor: (cursor: string | null) => void;
  setLastSyncAt: (timestamp: string | null) => void;
  setOrgTenantId: (orgId: string, tenantId: string) => void;
  getOrgTenantId: (orgId: string) => string | null;
  setOrgSeq: (orgId: string, entityType: string, seq: number) => void;
  getOrgSeq: (orgId: string, entityType: string) => number;
  setChannelSeq: (orgId: string, channelId: string, entityType: string, seq: number) => void;
  getChannelSeq: (orgId: string, channelId: string, entityType: string) => number;
  /** Build flat seqs map for the catchup API body (backward-compatible with backend) */
  getFlatSeqs: () => Record<string, number>;
  reset: () => void;
}

const initStore = {
  cursor: null as string | null,
  lastSyncAt: null as string | null,
  orgs: {} as Record<string, OrgSyncState>,
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

/** Offline sync state: `orgs` (per-org tenantId + entity/child-context seqs), plus global `cursor`/`lastSyncAt`. */
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

        setChannelSeq: (orgId, channelId, entityType, seq) =>
          set((s) => {
            const org = ensureOrg(s.orgs, orgId);
            org.contexts[channelId] ??= {};
            org.contexts[channelId][entityType] = seq;
          }),
        getChannelSeq: (orgId, channelId, entityType) => get().orgs[orgId]?.contexts[channelId]?.[entityType] ?? 0,

        getFlatSeqs: () => {
          const { orgs } = get();
          const flat: Record<string, number> = {};
          for (const [orgId, org] of Object.entries(orgs)) {
            for (const [et, seq] of Object.entries(org.seqs)) flat[`${orgId}:s:${et}`] = seq;
            for (const [ctxId, ctxSeqs] of Object.entries(org.contexts)) {
              for (const [et, seq] of Object.entries(ctxSeqs)) flat[`${ctxId}:s:${et}`] = seq;
            }
          }
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
