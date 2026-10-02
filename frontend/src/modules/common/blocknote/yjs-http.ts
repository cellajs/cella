/**
 * Yjs over HTTP: when the relay's socket has not synced a few seconds after starting while the API answers, a
 * connection pulls peers' edits and posts its own through the API's pull and push routes, and hands back to the
 * socket at its first sync. Stubs with their final signatures: the link is built on the release 3 branch.
 */

import type { ProductEntityType } from 'shared';
import type { YjsConnection } from '~/modules/common/blocknote/yjs-connections';

/** How long the socket may take to sync after starting before HTTP takes over, while the API answers. */
export const WS_SYNC_DEADLINE_MS = 5_000;
/** How often a connection an editor holds pulls peers' edits while the tab is visible. */
export const HTTP_PULL_MS = 10_000;
/** Local edits wait this long for more before one post carries them all, and never longer than `HTTP_PUSH_MAX_WAIT_MS`. */
export const HTTP_PUSH_DEBOUNCE_MS = 500;
export const HTTP_PUSH_MAX_WAIT_MS = 2_000;
/** The most update bytes one post carries, under the API's 1 MB body limit once base64url-encoded. Matches the push route's limit. */
export const HTTP_CHUNK_BYTES = 512 * 1024;

/** The document a link syncs: its entity and the scope the routes check it in. */
export interface HttpLinkScope {
  entityType: ProductEntityType;
  entityId: string;
  tenantId: string;
  organizationId: string;
}

/** A connection's HTTP transport while the relay is out of reach. */
export interface HttpLink {
  /** Pulls, then posts the handshake update when unsynced; resolves false when the API does not answer. */
  enter(): Promise<boolean>;
  /** Stops pulling and posting; a post in flight still settles. */
  leave(): void;
  /** Queues a local edit for the next post. */
  queue(update: Uint8Array): void;
  /** Pulls what the document lacks and applies it. */
  pull(): Promise<void>;
  /** True once the handshake is proven, nothing is queued and no post is in flight. */
  readonly clean: boolean;
}

/** The HTTP link of one connection. */
export function createHttpLink(_conn: YjsConnection, _scope: HttpLinkScope): HttpLink {
  throw new Error('[yjs] createHttpLink is not built yet');
}
