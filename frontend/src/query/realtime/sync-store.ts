import type { CatchUpMyStreamData } from 'sdk';
import type { ProductEntityType } from 'shared';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createStore } from 'zustand/vanilla';
import { isDebugMode } from '~/env';
import { idbKvStorage } from '~/query/idb-kv-storage';

interface OrgSyncState {
  /** Org-slot cursors by entity type. */
  seqs: Record<string, number>;
  /** Versions of the organization's versioned signals by type, as the last catchup returned them; absent in a store persisted before them. */
  signals?: Record<string, number>;
  /** Cursors of the channels below the organization, by channel id and then entity type. */
  channels: Record<string, Record<string, number>>;
}

type CatchupView = NonNullable<CatchUpMyStreamData['body']['views']>[number];

interface SyncStoreState {
  /** Generation of the server's sync books this client's cursors belong to; null before the first catchup. */
  generation: number | null;
  /** When this device last processed a catchup, on its own clock in epoch ms; null before the first. */
  caughtUpAt: number | null;
  /** When this device refetches its synced cache after a start over, on its own clock in epoch ms; null when none waits. */
  refetchDueAt: number | null;
  orgs: Record<string, OrgSyncState>;

  /**
   * Takes the generation a catchup answered with. Another one than the client held means the server corrected or
   * rebuilt its books: every cursor goes back to 0, so the catchup that follows stores the frontiers as baselines, and the
   * refetch is due at this client's random share of `spreadWindowMs`, the window the server sized for the audience that
   * hears of the generation at the same moment. The signal versions go too: books rebuilt from lost counters count them
   * again from 0, and a stored version the new count reaches would hide its runs, so each runs once now.
   */
  adoptGeneration: (generation: number, spreadWindowMs: number) => void;
  /**
   * Starts over when this device last caught up longer than `awayMs` ago: the server may have removed tombstones it
   * never read, so every cursor goes back to 0, as for a new generation, and the refetch is due at once.
   * @returns true when the cursors were reset.
   */
  startOverIfAway: (awayMs: number) => boolean;
  markCaughtUp: () => void;
  markRefetched: () => void;
  /** Creates the org entry the next catchup declares views for. */
  trackOrg: (organizationId: string) => void;
  /** Drop a stale org from the persisted store; orgs are otherwise never pruned and each one costs entity-type views in every catchup body. */
  removeOrg: (organizationId: string) => void;
  setOrgSeq: (organizationId: string, entityType: ProductEntityType, seq: number) => void;
  getOrgSeq: (organizationId: string, entityType: ProductEntityType) => number;
  setSignalVersion: (organizationId: string, type: string, version: number) => void;
  getSignalVersion: (organizationId: string, type: string) => number;
  /**
   * Takes the version of a signal whose live handlers ran, so the next catchup does not run it again. Only the next
   * version is taken: a gap (a frame lost to a stream break, a signal of a channel this tab cannot read, a version a
   * cascade moved, a frame without a version, a handler that threw) leaves the run to the next catchup. A catchup answer
   * read before a version taken here sets it back, and the signal runs at most twice more: nothing is lost.
   */
  noteHeardSignal: (organizationId: string, type: string, version: number) => void;
  setChannelSeq: (organizationId: string, channelId: string, entityType: ProductEntityType, seq: number) => void;
  getChannelSeq: (organizationId: string, channelId: string, entityType: ProductEntityType) => number;
  /** Build the view-driven catchup body: one org view per (org, entityType). */
  getCatchupViews: (entityTypes: readonly ProductEntityType[]) => CatchupView[];
  reset: () => void;
}

const initStore: Pick<SyncStoreState, 'generation' | 'caughtUpAt' | 'refetchDueAt' | 'orgs'> = {
  generation: null,
  caughtUpAt: null,
  refetchDueAt: null,
  orgs: {},
};

/** The server's cap on catchup views (`streamCatchupBodySchema`): a longer body fails the SDK's validation, and with it the whole catchup. */
const maxCatchupViews = 256;

/**
 * Puts every org and channel cursor back at 0 and records when the synced cache refetches. Signal versions stay: across
 * an absence they only count up, so the next catchup runs only the handlers of signals sent meanwhile.
 */
function resetCursors(state: Pick<SyncStoreState, 'orgs' | 'refetchDueAt'>, refetchDueAt: number): void {
  for (const org of Object.values(state.orgs)) {
    for (const entityType of Object.keys(org.seqs)) org.seqs[entityType] = 0;
    org.channels = {};
  }
  state.refetchDueAt = refetchDueAt;
}

function ensureOrg(orgs: Record<string, OrgSyncState>, organizationId: string): OrgSyncState {
  orgs[organizationId] ??= { seqs: {}, channels: {}, signals: {} };
  return orgs[organizationId];
}

/** This user's sync cursors, persisted: the org and channel sequences. */
export const syncStore = createStore<SyncStoreState>()(
  devtools(
    persist(
      immer((set, get) => ({
        ...initStore,

        adoptGeneration: (generation, spreadWindowMs) => {
          const held = get().generation;
          if (generation === held) return;
          set((state) => {
            state.generation = generation;
            if (held === null) return;
            resetCursors(state, Date.now() + Math.random() * spreadWindowMs);
            for (const org of Object.values(state.orgs)) org.signals = {};
          });
        },
        startOverIfAway: (awayMs) => {
          const { caughtUpAt } = get();
          if (caughtUpAt === null || Date.now() - caughtUpAt <= awayMs) return false;
          // One device comes back alone, so there is no herd to spread.
          set((state) => resetCursors(state, Date.now()));
          return true;
        },
        markCaughtUp: () =>
          set((state) => {
            state.caughtUpAt = Date.now();
          }),
        markRefetched: () =>
          set((state) => {
            state.refetchDueAt = null;
          }),

        trackOrg: (organizationId) =>
          set((state) => {
            ensureOrg(state.orgs, organizationId);
          }),

        removeOrg: (organizationId) =>
          set((state) => {
            delete state.orgs[organizationId];
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
        noteHeardSignal: (organizationId, type, version) =>
          set((state) => {
            const org = state.orgs[organizationId];
            if (!org || (org.signals?.[type] ?? 0) + 1 !== version) return;
            org.signals ??= {};
            org.signals[type] = version;
          }),

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

        getCatchupViews: (entityTypes) => {
          const views: CatchupView[] = [];
          for (const [organizationId, org] of Object.entries(get().orgs)) {
            for (const productType of entityTypes) {
              views.push({
                organizationId,
                productType,
                // Only the org slot proves org-wide ingestion, since child-channel cursors cover their own subtree; 0 means no baseline, so catchup stores the frontier and route loaders supply data.
                cursor: org.seqs[productType] ?? 0,
              });
            }
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
        partialize: ({ generation, caughtUpAt, refetchDueAt, orgs }) => ({ generation, caughtUpAt, refetchDueAt, orgs }),
      },
    ),
    { name: 'SyncStore', enabled: isDebugMode },
  ),
);
