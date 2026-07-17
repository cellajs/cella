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

/** One catchup view request: org-ledger cursor over a prefix set (see streamCatchupBodySchema). */
export interface CatchupViewRequest {
  key: string;
  organizationId: string;
  prefixes: string[];
  entityTypes: string[];
  cursor: number;
}

interface SyncStoreState {
  cursor: string | null;
  lastSyncAt: string | null;
  orgs: Record<string, OrgSyncState>;
  /**
   * Latest seq the server has mentioned per scope (channelId or orgId), which is the "known" side of the
   * known-vs-caught-up split. Recorded from every notification, even for pages the lazy scheduler
   * won't fetch (muted). Deliberately NOT persisted: catchup's counter comparison rebuilds it on
   * boot, and persisting would only risk staleness. Caught-up seqs stay in `orgs` (persisted).
   */
  known: Record<string, Record<string, number>>;

  setCursor: (cursor: string | null) => void;
  setLastSyncAt: (timestamp: string | null) => void;
  setOrgTenantId: (orgId: string, tenantId: string) => void;
  getOrgTenantId: (orgId: string) => string | null;
  setOrgSeq: (orgId: string, entityType: string, seq: number) => void;
  getOrgSeq: (orgId: string, entityType: string) => number;
  setChannelSeq: (orgId: string, channelId: string, entityType: string, seq: number) => void;
  getChannelSeq: (orgId: string, channelId: string, entityType: string) => number;
  /** Record the latest server-mentioned seq for a scope (monotonic max-merge). */
  setKnownSeq: (scopeId: string, entityType: string, seq: number) => void;
  getKnownSeq: (scopeId: string, entityType: string) => number;
  /** Build the view-driven catchup body: one org-prefix view per (org, entityType). */
  getCatchupViews: (entityTypes: readonly string[]) => CatchupViewRequest[];
  reset: () => void;
}

const initStore = {
  cursor: null as string | null,
  lastSyncAt: null as string | null,
  orgs: {} as Record<string, OrgSyncState>,
  known: {} as Record<string, Record<string, number>>,
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

        // Org-homed scopes arrive with channelId === orgId on the live wire, while catchup
        // reports them at org level. Normalize both to the org slot so live and catchup
        // share ONE caught-up watermark per scope.
        setChannelSeq: (orgId, channelId, entityType, seq) =>
          set((s) => {
            const org = ensureOrg(s.orgs, orgId);
            if (channelId === orgId) {
              org.seqs[entityType] = seq;
              return;
            }
            org.contexts[channelId] ??= {};
            org.contexts[channelId][entityType] = seq;
          }),
        getChannelSeq: (orgId, channelId, entityType) =>
          channelId === orgId
            ? (get().orgs[orgId]?.seqs[entityType] ?? 0)
            : (get().orgs[orgId]?.contexts[channelId]?.[entityType] ?? 0),

        setKnownSeq: (scopeId, entityType, seq) =>
          set((s) => {
            s.known[scopeId] ??= {};
            if (seq > (s.known[scopeId][entityType] ?? 0)) s.known[scopeId][entityType] = seq;
          }),
        getKnownSeq: (scopeId, entityType) => get().known[scopeId]?.[entityType] ?? 0,

        getCatchupViews: (entityTypes) => {
          const { orgs } = get();
          const views: CatchupViewRequest[] = [];
          for (const [orgId, org] of Object.entries(orgs)) {
            for (const entityType of entityTypes) {
              views.push({
                key: `${orgId}:${entityType}`,
                organizationId: orgId,
                prefixes: [orgId],
                entityTypes: [entityType],
                // Org-view cursor over the org ledger. Only the org slot proves org-WIDE
                // ingestion (child-scope watermarks cover their own subtree only); 0 means
                // no baseline yet — catchup stores the hw and route loaders supply data.
                cursor: org.seqs[entityType] ?? 0,
              });
            }
          }
          return views;
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
