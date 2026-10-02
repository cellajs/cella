/**
 * The app's own channel between tabs for collaborative documents: one BroadcastChannel per user, carrying each message
 * with the document's generation, so a tab never merges another generation's edits. It follows the per-user database:
 * open on the bound user's name, shut while none is bound (signed out, or impersonating).
 */

import { getLocalUserDb, subscribeOwnerChange, type YDocKey } from '~/query/local-user-db';

/**
 * A message between tabs. `update` carries a local edit and the row id its tab stored it under, null when that write
 * failed; `hello` follows a load, and peers answer it with an `update` holding what `vector` lacks.
 */
export type TabMessage =
  | { t: 'update'; key: string; generation: string; update: Uint8Array; rowId: number | null }
  | { t: 'hello'; key: string; generation: string; vector: Uint8Array };

/** A document's key on the channel. */
export const toTabKey = (key: YDocKey) => `${key.entityType}:${key.entityId}`;

const handlers = new Set<(msg: TabMessage) => void>();
let channel: BroadcastChannel | null = null;

/** The channel of the bound user's database, opened on first use; null while no database is bound. */
function currentChannel(): BroadcastChannel | null {
  const name = getLocalUserDb()?.name;
  if (!name || typeof BroadcastChannel === 'undefined') {
    closeChannel();
    return null;
  }
  const channelName = `${name}:ydocs`;
  if (channel?.name === channelName) return channel;
  closeChannel();
  channel = new BroadcastChannel(channelName);
  channel.onmessage = (event: MessageEvent<TabMessage>) => {
    for (const handler of handlers) handler(event.data);
  };
  return channel;
}

function closeChannel() {
  channel?.close();
  channel = null;
}

// Another user's edits must never reach this tab, nor this tab's reach theirs.
subscribeOwnerChange(() => {
  closeChannel();
  if (handlers.size > 0) currentChannel();
});

/** Sends a local edit to the other tabs, after the store committed it. */
export function postTabUpdate(msg: Extract<TabMessage, { t: 'update' }>): void {
  currentChannel()?.postMessage(msg);
}

/** Asks the other tabs for what a loaded document lacks. */
export function postTabHello(msg: Extract<TabMessage, { t: 'hello' }>): void {
  currentChannel()?.postMessage(msg);
}

/** Calls `handler` for each message another tab sends; returns the unsubscribe. */
export function onTabMessage(handler: (msg: TabMessage) => void): () => void {
  handlers.add(handler);
  currentChannel();
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) closeChannel();
  };
}
