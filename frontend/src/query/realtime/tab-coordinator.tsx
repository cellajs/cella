import { useEffect } from 'react';
import type { PostAppCatchupResponse } from 'sdk';
import { currentSchemaVersion } from 'shared/schema-evolution';
import { createStore } from 'zustand/vanilla';
import { createEmitter } from '~/query/realtime/sync-events';
import type { AppStreamNotification } from '~/query/realtime/types';
import { markBundleStale } from '~/query/schema-version-guard';

const channelName = 'tab-sync';
const leaderLockName = 'tab-leader';
const hasWebLocks = typeof navigator !== 'undefined' && 'locks' in navigator;
const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined';

/** What the leader's stream says of live delivery: whether the stream itself works, and whether the server's CDC worker reads. */
export interface SyncHealth {
  streamHealthy: boolean;
  workerAway: boolean;
}

type BroadcastMessage =
  | { type: 'stream-notification'; notification: AppStreamNotification }
  | { type: 'catchup'; response: PostAppCatchupResponse; baselineOnly: boolean }
  | { type: 'sync-health'; health: SyncHealth }
  | { type: 'schema-version'; version: number };

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
const notificationEmitter = createEmitter<AppStreamNotification>('TabNotification');
const catchupEmitter = createEmitter<{ response: PostAppCatchupResponse; baselineOnly: boolean }>('TabCatchup');
const syncHealthEmitter = createEmitter<SyncHealth>('TabSyncHealth');
/** What this tab last broadcast as leader, said again to a tab that opens later. */
let lastSyncHealth: SyncHealth | null = null;
let initPromise: Promise<void> | null = null;

/** Resolves when `signal` aborts. A lock callback awaits this to hold the lock releasably, freeing it for a waiting follower without closing the tab. */
function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

/** Idempotent: resolves once leader status is known, reusing the in-flight promise on repeat calls. */
export async function initTabCoordinator(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const store = tabCoordinatorStore.getState();

    if (hasBroadcastChannel && !broadcastChannel) {
      broadcastChannel = new BroadcastChannel(channelName);
      broadcastChannel.onmessage = handleBroadcastMessage;
      console.debug('[TabCoordinator] BroadcastChannel initialized');
      // Announce schema version so tabs running a different bundle detect skew.
      broadcastChannel.postMessage({ type: 'schema-version', version: currentSchemaVersion } satisfies BroadcastMessage);
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
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.debug('[TabCoordinator] Leadership wait aborted');
      } else {
        console.debug('[TabCoordinator] Leadership wait error:', error);
      }
    });
}

function handleBroadcastMessage(event: MessageEvent<BroadcastMessage>): void {
  const store = tabCoordinatorStore.getState();
  const message = event.data;

  if (message.type === 'schema-version') {
    if (message.version > currentSchemaVersion) {
      // A newer bundle runs in another tab, stop persisting (schema-version-guard).
      markBundleStale();
    } else if (message.version < currentSchemaVersion) {
      // An older tab announced itself after this one booted: announce again so it learns.
      broadcastChannel?.postMessage({ type: 'schema-version', version: currentSchemaVersion } satisfies BroadcastMessage);
    }
    // Every tab announces its version as it opens: the leader answers with the health of its stream, which a new tab has no way to know.
    if (store.isLeader && lastSyncHealth) broadcastChannel?.postMessage({ type: 'sync-health', health: lastSyncHealth } satisfies BroadcastMessage);
    return;
  }

  // The leader acts on its own stream: its notifications as they arrive, a catchup answer where its request returns.
  if (store.isLeader) return;
  if (message.type === 'sync-health') syncHealthEmitter.publish(message.health);
  if (message.type === 'stream-notification') notificationEmitter.publish(message.notification);
  if (message.type === 'catchup') catchupEmitter.publish({ response: message.response, baselineOnly: message.baselineOnly });
}

/** Called by the leader with each catchup answer: followers send no catchup request of their own. */
export function broadcastCatchup(response: PostAppCatchupResponse, baselineOnly: boolean): void {
  broadcastChannel?.postMessage({ type: 'catchup', response, baselineOnly } satisfies BroadcastMessage);
}

/** Followers register here to receive the leader's catchup answers. */
export const onCatchup = catchupEmitter.subscribe;

/** Called by the leader when the health of its stream changes: a follower has no stream of its own to judge by. */
export function broadcastSyncHealth(health: SyncHealth): void {
  lastSyncHealth = health;
  broadcastChannel?.postMessage({ type: 'sync-health', health } satisfies BroadcastMessage);
}

/** Followers register here to receive the health of the leader's stream. */
export const onSyncHealth = syncHealthEmitter.subscribe;

/** Called by the leader for each SSE notification it receives. */
export function broadcastNotification(notification: AppStreamNotification): void {
  broadcastChannel?.postMessage({ type: 'stream-notification', notification } satisfies BroadcastMessage);
}

/** Followers register here to receive the leader's notifications. */
export const onNotification = notificationEmitter.subscribe;

export function isLeader(): boolean {
  return tabCoordinatorStore.getState().isLeader;
}

/** Initializes multi-tab coordination. Only mounted in AppLayout. */
export function TabCoordinator() {
  useEffect(() => {
    initTabCoordinator();
  }, []);

  return null;
}
