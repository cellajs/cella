/**
 * The app's own channel between tabs for collaborative documents: one BroadcastChannel per user, which carries each
 * message with the document's generation, so a tab never merges another generation's edits. y-websocket's channel is
 * off, since it carries none. Stubs with their final signatures: the channel is built on the release 3 branch.
 */

/**
 * A message between tabs. `update` carries a local edit and the row id its tab stored it under, null when that write
 * failed; `hello` follows a load, and peers answer it with an `update` holding what `vector` lacks.
 */
export type TabMessage =
  | { t: 'update'; key: string; generation: string; update: Uint8Array; rowId: number | null }
  | { t: 'hello'; key: string; generation: string; vector: Uint8Array };

const notBuilt = (name: string) => new Error(`[yjs] ${name} is not built yet`);

/** Sends a local edit to the other tabs, after the store committed it. */
export function postTabUpdate(_msg: Extract<TabMessage, { t: 'update' }>): void {
  throw notBuilt('postTabUpdate');
}

/** Asks the other tabs for what a loaded document lacks. */
export function postTabHello(_msg: Extract<TabMessage, { t: 'hello' }>): void {
  throw notBuilt('postTabHello');
}

/** Calls `handler` for each message another tab sends; returns the unsubscribe. No channel is open yet, so none arrives. */
export function onTabMessage(_handler: (msg: TabMessage) => void): () => void {
  return () => {};
}
