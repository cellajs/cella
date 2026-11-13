import { useEffect } from 'react';
import type { CatchUpMyStreamResponse, StreamChange, StreamSignal } from 'sdk';
import { appConfig } from 'shared';
import { currentSchemaVersion } from 'shared/schema-evolution';
import { createStore } from 'zustand/vanilla';
import { markBundleStale } from '~/query/schema-version-guard';

const channelName = `${appConfig.slug}-tab-sync`;
const leaderLockName = `${appConfig.slug}-tab-leader`;
const hasWebLocks = typeof navigator !== 'undefined' && 'locks' in navigator;
const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined';

/** What the leader's stream says of live delivery: whether the stream itself works, and whether the server's CDC worker reads. */
export interface SyncHealth {
  streamHealthy: boolean;
  workerAway: boolean;
}

/** What the leader posts to the follower tabs: the frames of its stream, its catchup answers and the health of its stream. */
export type LeaderMessage =
  | { type: 'stream-change'; change: StreamChange }
  | { type: 'stream-signal'; signal: StreamSignal }
  | { type: 'catchup'; response: CatchUpMyStreamResponse }
  | { type: 'sync-health'; health: SyncHealth };

/** What a tab says as it opens, and again to an older tab that opens after it: the versions its bundle stores the cache under. */
interface TabAnnouncement {
  type: 'tab-announcement';
  schemaVersion: number;
  cacheVersion: number;
}

type BroadcastMessage = LeaderMessage | TabAnnouncement;

const announcement: TabAnnouncement = { type: 'tab-announcement', schemaVersion: currentSchemaVersion, cacheVersion: appConfig.clientCacheVersion };

interface TabCoordinatorState {
  isLeader: boolean;
  isReady: boolean;
  setIsLeader: (isLeader: boolean) => void;
  setIsReady: (isReady: boolean) => void;
}

export const tabCoordinatorStore = createStore<TabCoordinatorState>((set) => ({
  isLeader: false,
  isReady: false,
  setIsLeader: (isLeader) => set({ isLeader }),
  setIsReady: (isReady) => set({ isReady }),
}));

let broadcastChannel: BroadcastChannel | null = null;
let lockController: AbortController | null = null;
let leaderMessageHandler: ((message: LeaderMessage) => void) | null = null;
/** What this tab last broadcast as leader, said again to a tab that opens later; null once it heard another leader's. */
let lastSyncHealth: SyncHealth | null = null;
let initPromise: Promise<void> | null = null;

/** Resolves when `signal` aborts. A lock callback awaits this to hold the lock releasably, freeing it for a waiting follower without closing the tab. */
const untilAborted = (signal: AbortSignal): Promise<void> =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener('abort', () => resolve(), { once: true });
  });

/** Idempotent: resolves once leader status is known, reusing the in-flight promise on repeat calls. */
export async function initTabCoordinator(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const store = tabCoordinatorStore.getState();

    if (hasBroadcastChannel && !broadcastChannel) {
      broadcastChannel = new BroadcastChannel(channelName);
      broadcastChannel.onmessage = handleBroadcastMessage;
      console.debug('[TabCoordinator] BroadcastChannel initialized');
      // Tabs running another bundle learn of the skew, and the leader answers with the health of its stream.
      broadcastChannel.postMessage(announcement);
    }

    if (hasWebLocks) {
      await attemptLeaderElection();
    } else {
      console.debug('[TabCoordinator] Web Locks not available, assuming leader role');
      store.setIsLeader(true);
      store.setIsReady(true);
    }
  })();

  return initPromise;
}

/**
 * Release leadership so a waiting follower is promoted. Call when the tab leaves the authenticated app: a tab holding leadership while not streaming starves every follower.
 * Clearing `initPromise` lets a later return re-run the election and restore the pending promotion request.
 */
export function releaseTabLeadership(): void {
  const store = tabCoordinatorStore.getState();

  lockController?.abort();
  lockController = null;
  initPromise = null;

  store.setIsLeader(false);
  store.setIsReady(false);
}

/** Acquire the leader lock (first tab to acquire it becomes leader); resolves once leader status is known. */
function attemptLeaderElection(): Promise<void> {
  const store = tabCoordinatorStore.getState();
  // One controller per election: aborting releases the lock this tab holds or awaits. `ifAvailable` cannot take a signal, so the callback checks it by hand.
  lockController = new AbortController();
  const { signal } = lockController;

  return new Promise<void>((resolveElection) => {
    // `ifAvailable` resolves leader status immediately; a plain request would block until the held lock frees.
    navigator.locks
      .request(leaderLockName, { ifAvailable: true }, async (lock) => {
        if (lock) {
          console.debug('[TabCoordinator] Acquired leader lock');
          store.setIsLeader(true);
          store.setIsReady(true);
          resolveElection();

          // Returning frees the lock, so hold it until leadership is released or the tab closes.
          await untilAborted(signal);
          return;
        }

        console.debug('[TabCoordinator] Another tab is leader, becoming follower');
        store.setIsLeader(false);
        store.setIsReady(true);
        resolveElection();

        // Runs in the background; does not block initialization.
        waitForLeadership(signal);
      })
      .catch((error) => {
        console.debug('[TabCoordinator] Leader election error:', error);
        // No election result means no other tab can be assumed to stream: take the role.
        store.setIsLeader(true);
        store.setIsReady(true);
        resolveElection();
      });
  });
}

/** Follower tabs queue here and take over when the current leader closes or releases. */
function waitForLeadership(signal: AbortSignal): void {
  const store = tabCoordinatorStore.getState();

  navigator.locks
    .request(leaderLockName, { signal }, async () => {
      console.debug('[TabCoordinator] Promoted to leader');
      store.setIsLeader(true);

      // Returning frees the lock, so hold it until leadership is released.
      await untilAborted(signal);
    })
    .catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') console.debug('[TabCoordinator] Leadership wait aborted');
      else console.debug('[TabCoordinator] Leadership wait error:', error);
    });
}

function handleBroadcastMessage(event: MessageEvent<BroadcastMessage>): void {
  const store = tabCoordinatorStore.getState();
  const message = event.data;

  if (message.type === 'tab-announcement') {
    const { schemaVersion, cacheVersion } = message;
    if (schemaVersion > currentSchemaVersion || cacheVersion > appConfig.clientCacheVersion) {
      // A newer bundle runs in another tab: stop persisting and look for its update (schema-version-guard).
      markBundleStale();
    } else if (schemaVersion < currentSchemaVersion || cacheVersion < appConfig.clientCacheVersion) {
      // An older tab announced itself after this one booted: announce again so it learns.
      broadcastChannel?.postMessage(announcement);
    }
    // The leader answers every announcement with the health of its stream, which a new tab has no way to know.
    if (store.isLeader && lastSyncHealth) broadcastChannel?.postMessage({ type: 'sync-health', health: lastSyncHealth } satisfies BroadcastMessage);
    return;
  }

  // The leader acts on its own stream: its changes and signals as they arrive, a catchup answer where its request returns.
  if (store.isLeader) return;
  if (message.type === 'sync-health') lastSyncHealth = null;
  // Logged and dropped here: a throw would leave the channel handler as an uncaught error.
  try {
    leaderMessageHandler?.(message);
  } catch (error) {
    console.error(`[TabCoordinator] ${message.type} handler failed:`, error);
  }
}

/** Sets the one handler of what the leader posts; the stream manager sets it, and it runs only while this tab follows. */
export function onLeaderMessage(handler: (message: LeaderMessage) => void): void {
  leaderMessageHandler = handler;
}

/** Called by the leader with each frame and catchup answer it receives, and with the health of its stream, which it posts only when it changed. */
export function postToFollowers(message: LeaderMessage): void {
  if (message.type === 'sync-health') {
    const { health } = message;
    if (lastSyncHealth?.streamHealthy === health.streamHealthy && lastSyncHealth.workerAway === health.workerAway) return;
    lastSyncHealth = health;
  }
  broadcastChannel?.postMessage(message);
}

export const isLeader = (): boolean => tabCoordinatorStore.getState().isLeader;

/** Initializes multi-tab coordination. Only mounted in AppLayout. */
export function TabCoordinator() {
  useEffect(() => {
    initTabCoordinator();
  }, []);

  return null;
}
