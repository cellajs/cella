import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createStore } from 'zustand/vanilla';
import { isDebugMode } from '~/env';
import { idbKvStorage } from '~/query/idb-kv-storage';

interface OrgSyncState {
  /** Empty until a change or a membership names it. */
  tenantId: string;
  /** Org-slot cursors by entity type. */
  seqs: Record<string, number>;
  /** Versions of the organization's versioned signals by type, as the last catchup returned them; absent in a store persisted before them. */
  signals?: Record<string, number>;
  /** Cursors of the channels below the organization, by channel id and then entity type. */
  channels: Record<string, Record<string, number>>;
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
  /** Generation of the server's sync books this client's cursors belong to; null before the first catchup. */
  generation: number | null;
  /** When this device last processed a catchup, on its own clock in epoch ms; null before the first. */
  caughtUpAt: number | null;
  orgs: Record<string, OrgSyncState>;
  /** Grant-boundary views registered by the app (views.ts), keyed by view key. */
  views: Record<string, RegisteredSyncView>;

  setCursor: (cursor: string | null) => void;
  /**
   * Takes the generation a catchup answered with. Another one than the client held means the server corrected or
   * rebuilt its books: every cursor goes back to 0, so the catchup that follows stores the frontiers as baselines.
   * @returns true when the client held another generation and its synced data needs a refetch.
   */
  adoptGeneration: (generation: number | undefined) => boolean;
  /**
   * Starts over when this device last caught up longer than `awayMs` ago: the server may have removed tombstones it
   * never read, so every cursor goes back to 0, as for a new generation.
   * @returns true when the cursors were reset and the synced data needs a refetch.
   */
  startOverIfAway: (awayMs: number) => boolean;
  markCaughtUp: () => void;
  /** Creates the org entry the next catchup declares views for; a non-empty tenant id replaces the stored one. */
  trackOrg: (organizationId: string, tenantId?: string) => void;
  getOrgTenantId: (organizationId: string) => string | null;
  /** Drop a stale org (and its views) from the persisted store; orgs are otherwise never pruned and each one costs entity-type views in every catchup body. */
  removeOrg: (organizationId: string) => void;
  setOrgSeq: (organizationId: string, entityType: string, seq: number) => void;
  getOrgSeq: (organizationId: string, entityType: string) => number;
  setSignalVersion: (organizationId: string, type: string, version: number) => void;
  getSignalVersion: (organizationId: string, type: string) => number;
  setChannelSeq: (organizationId: string, channelId: string, entityType: string, seq: number) => void;
  getChannelSeq: (organizationId: string, channelId: string, entityType: string) => number;
  /**
   * Register a grant-boundary view. Identity is prefix set plus entity types plus depth, and any identity change resets the cursor to 0:
   * a grown prefix set has history predating the cursor that a range fetch would skip.
   */
  declareSyncView: (key: string, view: Omit<RegisteredSyncView, 'cursor'>) => void;
  removeSyncView: (key: string) => void;
  setViewCursor: (key: string, cursor: number) => void;
  getView: (key: string) => RegisteredSyncView | undefined;
  /** Build the view-driven catchup body: org views per (org, entityType) + registered views. */
  getCatchupViews: (entityTypes: readonly string[]) => CatchupViewRequest[];
  reset: () => void;
}

const initStore: Pick<SyncStoreState, 'cursor' | 'generation' | 'caughtUpAt' | 'orgs' | 'views'> = {
  cursor: null,
  generation: null,
  caughtUpAt: null,
  orgs: {},
  views: {},
};

/** The server's cap on catchup views (`streamCatchupBodySchema`): a longer body fails the SDK's validation, and with it the whole catchup. */
const maxCatchupViews = 256;

/** View identity for the re-baseline rule: prefixes + types + depth (order-insensitive). */
function viewIdentity(view: Omit<RegisteredSyncView, 'cursor'>): string {
  return `${[...view.prefixes].sort().join(',')}|${[...view.entityTypes].sort().join(',')}|${view.depth}`;
}

/** Puts every org, channel and view cursor back at 0 and forgets signal versions, so the next catchup stores the server's as baselines. */
function resetCursors(state: Pick<SyncStoreState, 'orgs' | 'views'>): void {
  for (const org of Object.values(state.orgs)) {
    for (const entityType of Object.keys(org.seqs)) org.seqs[entityType] = 0;
    org.channels = {};
    org.signals = {};
  }
  for (const view of Object.values(state.views)) view.cursor = 0;
}

function ensureOrg(orgs: Record<string, OrgSyncState>, organizationId: string, tenantId?: string): OrgSyncState {
  const existing = orgs[organizationId];
  if (!existing) {
    const created: OrgSyncState = { tenantId: tenantId ?? '', seqs: {}, channels: {}, signals: {} };
    orgs[organizationId] = created;
    return created;
  }
  if (tenantId) existing.tenantId = tenantId;
  return existing;
}

/** This user's sync cursors, persisted: the stream cursor, the org and channel sequences, and the registered views. */
export const syncStore = createStore<SyncStoreState>()(
  devtools(
    persist(
      immer((set, get) => ({
        ...initStore,

        setCursor: (cursor) =>
          set((state) => {
            state.cursor = cursor;
          }),
        adoptGeneration: (generation) => {
          const held = get().generation;
          if (generation === undefined || generation === held) return false;
          set((state) => {
            state.generation = generation;
            if (held !== null) resetCursors(state);
          });
          return held !== null;
        },
        startOverIfAway: (awayMs) => {
          const { caughtUpAt } = get();
          if (caughtUpAt === null || Date.now() - caughtUpAt <= awayMs) return false;
          set((state) => resetCursors(state));
          return true;
        },
        markCaughtUp: () =>
          set((state) => {
            state.caughtUpAt = Date.now();
          }),

        trackOrg: (organizationId, tenantId) =>
          set((state) => {
            ensureOrg(state.orgs, organizationId, tenantId);
          }),
        getOrgTenantId: (organizationId) => get().orgs[organizationId]?.tenantId || null,

        removeOrg: (organizationId) =>
          set((state) => {
            delete state.orgs[organizationId];
            for (const [key, view] of Object.entries(state.views)) {
              if (view.organizationId === organizationId) delete state.views[key];
            }
          }),

        setOrgSeq: (organizationId, entityType, seq) =>
          set((state) => {
            ensureOrg(state.orgs, organizationId).seqs[entityType] = seq;
          }),
        getOrgSeq: (organizationId, entityType) => get().orgs[organizationId]?.seqs[entityType] ?? 0,

        setSignalVersion: (organizationId, type, version) =>
          set((state) => {
            const org = ensureOrg(state.orgs, organizationId);
            org.signals ??= {};
            org.signals[type] = version;
          }),
        getSignalVersion: (organizationId, type) => get().orgs[organizationId]?.signals?.[type] ?? 0,

        // Org-homed channel views arrive with channelId === organizationId live but at org level in catchup; both normalize to the org slot so they share one caught-up cursor.
        setChannelSeq: (organizationId, channelId, entityType, seq) =>
          set((state) => {
            const org = ensureOrg(state.orgs, organizationId);
            if (channelId === organizationId) {
              org.seqs[entityType] = seq;
              return;
            }
            org.channels[channelId] ??= {};
            org.channels[channelId][entityType] = seq;
          }),
        getChannelSeq: (organizationId, channelId, entityType) =>
          channelId === organizationId
            ? (get().orgs[organizationId]?.seqs[entityType] ?? 0)
            : (get().orgs[organizationId]?.channels[channelId]?.[entityType] ?? 0),

        declareSyncView: (key, view) =>
          set((state) => {
            const existing = state.views[key];
            const cursor = existing && viewIdentity(existing) === viewIdentity(view) ? existing.cursor : 0;
            state.views[key] = { ...view, cursor };
          }),
        removeSyncView: (key) =>
          set((state) => {
            delete state.views[key];
          }),
        setViewCursor: (key, cursor) =>
          set((state) => {
            if (state.views[key]) state.views[key].cursor = cursor;
          }),
        getView: (key) => get().views[key],

        getCatchupViews: (entityTypes) => {
          const { orgs } = get();
          const views: CatchupViewRequest[] = [];
          for (const [organizationId, org] of Object.entries(orgs)) {
            for (const entityType of entityTypes) {
              views.push({
                key: `${organizationId}:${entityType}`,
                organizationId,
                prefixes: [organizationId],
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
          // A partial sync beats none: the dropped views do not advance this cycle, and org pruning keeps this unreachable.
          if (views.length > maxCatchupViews) {
            console.warn(`[SyncStore] Catchup views truncated ${views.length} → ${maxCatchupViews}; sync coverage is partial`);
            return views.slice(0, maxCatchupViews);
          }
          return views;
        },

        reset: () => set(() => initStore),
      })),
      {
        name: 'sync',
        // Version 1 renamed `contexts` to `channels`: older cursors are dropped, so the next catchup re-baselines
        version: 1,
        migrate: () => ({}),
        skipHydration: true,
        storage: createJSONStorage(() => idbKvStorage('sync')),
        partialize: (state) => ({
          cursor: state.cursor,
          generation: state.generation,
          caughtUpAt: state.caughtUpAt,
          orgs: state.orgs,
          views: state.views,
        }),
      },
    ),
    { name: 'SyncStore', enabled: isDebugMode },
  ),
);
