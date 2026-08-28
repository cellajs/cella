import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createStore } from 'zustand/vanilla';
import { isDebugMode } from '~/env';
import { idbKvStorage } from '~/query/idb-kv-storage';

interface OrgSyncState {
  tenantId: string;
  seqs: Record<string, number>;
  contexts: Record<string, Record<string, number>>;
}

/** One catchup view request: org-sequence cursor over a prefix set (see streamCatchupBodySchema). */
export interface CatchupViewRequest {
  key: string;
  organizationId: string;
  prefixes: string[];
  entityTypes: string[];
  depth?: 'self' | 'subtree';
  cursor: number;
}

/** A registered grant-boundary view (see views.ts): identity = prefix set + types + depth. */
export interface RegisteredSyncView {
  organizationId: string;
  prefixes: string[];
  entityTypes: string[];
  depth: 'self' | 'subtree';
  cursor: number;
}

interface SyncStoreState {
  cursor: string | null;
  lastSyncAt: string | null;
  orgs: Record<string, OrgSyncState>;
  /** Grant-boundary views registered by the app (views.ts), keyed by view key. */
  views: Record<string, RegisteredSyncView>;
  /** Server-known sequence per view including muted notifications, not persisted: catchup rebuilds it, while persisted org state holds caught-up sequences. */
  known: Record<string, Record<string, number>>;

  setCursor: (cursor: string | null) => void;
  setLastSyncAt: (timestamp: string | null) => void;
  setOrgTenantId: (orgId: string, tenantId: string) => void;
  getOrgTenantId: (orgId: string) => string | null;
  /** Drop a stale org (and its views) from the persisted store; orgs are otherwise never pruned and each one costs entity-type views in every catchup body. */
  removeOrg: (orgId: string) => void;
  setOrgSeq: (orgId: string, entityType: string, seq: number) => void;
  getOrgSeq: (orgId: string, entityType: string) => number;
  setChannelSeq: (orgId: string, channelId: string, entityType: string, seq: number) => void;
  getChannelSeq: (orgId: string, channelId: string, entityType: string) => number;
  /** Record the latest server-mentioned seq for a channel view (monotonic max-merge). */
  setKnownSeq: (channelViewId: string, entityType: string, seq: number) => void;
  getKnownSeq: (channelViewId: string, entityType: string) => number;
  /**
   * Register a grant-boundary view. Identity is prefix set plus entity types plus depth, and any identity change resets the cursor to 0:
   * a grown prefix set has history predating the cursor that a delta fetch would skip.
   */
  declareSyncView: (key: string, view: Omit<RegisteredSyncView, 'cursor'>) => void;
  removeSyncView: (key: string) => void;
  setViewCursor: (key: string, cursor: number) => void;
  getView: (key: string) => RegisteredSyncView | undefined;
  /** Build the view-driven catchup body: org views per (org, entityType) + registered views. */
  getCatchupViews: (entityTypes: readonly string[]) => CatchupViewRequest[];
  reset: () => void;
}

const initStore = {
  cursor: null as string | null,
  lastSyncAt: null as string | null,
  orgs: {} as Record<string, OrgSyncState>,
  views: {} as Record<string, RegisteredSyncView>,
  known: {} as Record<string, Record<string, number>>,
};

/** View identity for the re-baseline rule: prefixes + types + depth (order-insensitive). */
function viewIdentity(view: Omit<RegisteredSyncView, 'cursor'>): string {
  return `${[...view.prefixes].sort().join(',')}|${[...view.entityTypes].sort().join(',')}|${view.depth}`;
}

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

/** Vanilla Zustand store for offline sync state: per-org sequences plus the global cursor and last-sync time. */
export const syncStore = createStore<SyncStoreState>()(
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

        removeOrg: (orgId) =>
          set((s) => {
            delete s.orgs[orgId];
            for (const [key, view] of Object.entries(s.views)) {
              if (view.organizationId === orgId) delete s.views[key];
            }
          }),

        setOrgSeq: (orgId, entityType, seq) =>
          set((s) => {
            ensureOrg(s.orgs, orgId).seqs[entityType] = seq;
          }),
        getOrgSeq: (orgId, entityType) => get().orgs[orgId]?.seqs[entityType] ?? 0,

        // Org-homed channel views arrive with channelId === orgId live but at org level in catchup; both normalize to the org slot so they share one caught-up cursor.
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

        declareSyncView: (key, view) =>
          set((s) => {
            const existing = s.views[key];
            const cursor = existing && viewIdentity(existing) === viewIdentity(view) ? existing.cursor : 0;
            s.views[key] = { ...view, cursor };
          }),
        removeSyncView: (key) =>
          set((s) => {
            delete s.views[key];
          }),
        setViewCursor: (key, cursor) =>
          set((s) => {
            if (s.views[key]) s.views[key].cursor = cursor;
          }),
        getView: (key) => get().views[key],

        setKnownSeq: (channelViewId, entityType, seq) =>
          set((s) => {
            s.known[channelViewId] ??= {};
            if (seq > (s.known[channelViewId][entityType] ?? 0)) s.known[channelViewId][entityType] = seq;
          }),
        getKnownSeq: (channelViewId, entityType) => get().known[channelViewId]?.[entityType] ?? 0,

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
                // Only the org slot proves org-wide ingestion, since child-channel cursors cover their own subtree; 0 means no baseline, so catchup stores the frontier and route loaders supply data.
                cursor: org.seqs[entityType] ?? 0,
              });
            }
          }
          // Registered grant-boundary views ride the same request, adding precision over the org-view baseline.
          for (const [key, view] of Object.entries(get().views)) {
            views.push({ key, ...view });
          }
          // Server cap (streamCatchupBodySchema): an oversized body fails SDK validation client-side,
          // killing the whole catchup. Truncation degrades to partial sync (dropped views simply do
          // not advance this cycle), which beats no sync at all; org pruning keeps this unreachable.
          if (views.length > 256) {
            console.warn(`[SyncStore] Catchup views truncated ${views.length} → 256; sync coverage is partial`);
            return views.slice(0, 256);
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
          views: state.views,
        }),
      },
    ),
    { name: 'SyncStore', enabled: isDebugMode },
  ),
);

/** Get the current cursor value (for SSE reconnect). Returns 'now' if no cursor is set. */
export function getSyncCursor(): string {
  return syncStore.getState().cursor ?? 'now';
}
