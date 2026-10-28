import { getLocalUserDb, subscribeLocalUserChange, type YDocKey } from '~/query/local-user-db';

/**
 * A message on the app's channel between tabs, one BroadcastChannel per user. Each carries the document's generation, so
 * a tab never merges another generation's edits. `update` carries a local edit and the row id its tab stored it under,
 * null when that write failed; `hello` follows a load, and peers answer it with an `update` holding what `vector` lacks.
 */
export type TabMessage =
  | { kind: 'update'; key: string; generation: string; update: Uint8Array; rowId: number | null }
  | { kind: 'hello'; key: string; generation: string; vector: Uint8Array };

/** A document's key as one string, `entityType:entityId`: the tab channel's message key, and the store's lookup key. */
export const yDocKeyString = (key: YDocKey) => `${key.entityType}:${key.entityId}`;

const handlers = new Set<(message: TabMessage) => void>();
let channel: BroadcastChannel | null = null;

/** The channel of the bound user's database, opened on first use; null while none is bound (signed out, or impersonating). */
function currentChannel(): BroadcastChannel | null {
  const name = getLocalUserDb()?.name;
  if (!name || typeof BroadcastChannel === 'undefined') {
    closeChannel();
    return null;
  }
  // A new name whenever the message shape changes, so a tab still running an older build never reads one it cannot parse
  const channelName = `${name}:ydoc-tabs`;
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
subscribeLocalUserChange(() => {
  closeChannel();
  if (handlers.size > 0) currentChannel();
});

/** Sends a message to the bound user's other tabs. */
export function postTabMessage(message: TabMessage): void {
  currentChannel()?.postMessage(message);
}

/** Calls `handler` for each message another tab sends; returns the unsubscribe. */
export function onTabMessage(handler: (message: TabMessage) => void): () => void {
  handlers.add(handler);
  currentChannel();
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) closeChannel();
  };
}
