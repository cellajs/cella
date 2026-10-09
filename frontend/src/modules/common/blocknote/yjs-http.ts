/**
 * Yjs over HTTP: when the relay's socket has not synced a few seconds after starting while the API answers, a
 * connection pulls peers' edits and posts its own through the API's pull and push routes, and hands back to the
 * socket at its first sync.
 */

import type { ProductEntityType } from 'shared';
import * as Y from 'yjs';
import { ApiError } from '~/lib/api';
import { pullYjsDiff, pushYjsDiff } from '~/modules/common/blocknote/query';
import { applyRemoteUpdate, type YjsConnection } from '~/modules/common/blocknote/yjs-connections';
import type { UnsaveableReason } from '~/query/local-user-db';

/** How long the socket may take to sync after starting before HTTP takes over, while the API answers. */
export const WS_SYNC_DEADLINE_MS = 5_000;
/** How often a connection an editor holds pulls peers' edits while the tab is visible. */
const HTTP_PULL_MS = 10_000;
/** Local edits wait this long for more before one post carries them all, and never longer than `HTTP_PUSH_MAX_WAIT_MS`. */
const HTTP_PUSH_DEBOUNCE_MS = 500;
const HTTP_PUSH_MAX_WAIT_MS = 2_000;
/**
 * The most update bytes one post carries, under the API's 1 MB body limit once base64url-encoded. Matches the push route's limit.
 * @testSeam
 */
export const HTTP_CHUNK_BYTES = 512 * 1024;
/** Focus, or the tab turning visible, pulls at most this often. */
const HTTP_PULL_GAP_MS = 2_000;
/** A failed request is retried after 1 s, doubling up to the minute the routes' limiter counts a caller in. */
const HTTP_RETRY_MS = 1_000;
const HTTP_RETRY_MAX_MS = 60_000;

/** The document a link syncs: its entity and the scope the routes check it in. */
export interface HttpLinkScope {
  entityType: ProductEntityType;
  entityId: string;
  tenantId: string;
  organizationId: string;
}

/** What a link asks of its connection. */
export interface HttpLinkHooks {
  /** The ledger changed: the connection checks whether the server now holds every edit. */
  onChange(): void;
  /**
   * The routes' final answer: the entity was deleted (404), edit rights are gone (403), the update is refused (400,
   * 413), or the server holds another generation of the document (409, or a pull). The link left already.
   */
  end(reason: UnsaveableReason): void;
}

/** A connection's HTTP transport while the relay is out of reach. */
export interface HttpLink {
  /**
   * Pulls, then posts the handshake update when unsynced. Resolves true once a pull answered; a failed pull is retried
   * with backoff, so it resolves false only when the link left first or a final answer ended it.
   */
  enter(): Promise<boolean>;
  /** Stops pulling and posting, and forgets what it queued: the next handshake, over either transport, carries the document. A post in flight still settles. */
  leave(): void;
  /** Queues a local edit for the next post; while the link is out, it is kept for the next handshake's batches. */
  queue(update: Uint8Array): void;
  /** Pulls what the document lacks and applies it. */
  pull(): Promise<void>;
  /** True once the handshake is proven, nothing is queued and no post is in flight. */
  readonly clean: boolean;
}

/** What a failed request means: a final answer, a 409 naming the generation that holds (null: no document), or one to retry. */
type Failure = { kind: 'end'; reason: Exclude<UnsaveableReason, 'replaced'> } | { kind: 'conflict'; generation: string | null } | { kind: 'retry' };

function classify(error: unknown): Failure {
  // A network failure, which the API client follows with a connectivity check, or an answer that failed validation.
  if (!(error instanceof ApiError)) return { kind: 'retry' };
  if (error.status === 403) return { kind: 'end', reason: 'denied' };
  if (error.status === 404) return { kind: 'end', reason: 'deleted' };
  if (error.status === 400 || error.status === 413) return { kind: 'end', reason: 'refused' };
  if (error.status === 409) {
    const generation = error.meta?.generation;
    return { kind: 'conflict', generation: typeof generation === 'string' ? generation : null };
  }
  // 401, 429 and 5xx.
  return { kind: 'retry' };
}

const retryDelay = (attempt: number) => Math.min(HTTP_RETRY_MS * 2 ** attempt, HTTP_RETRY_MAX_MS);

/**
 * Merges consecutive updates into posts of at most `cap` bytes, in order. An update larger than `cap` cannot go over
 * HTTP: it is left out, counted in `oversize`, and waits for the socket, which takes up to 2 MB.
 * @testSeam
 */
export function batchUpdates(updates: Uint8Array[], cap = HTTP_CHUNK_BYTES): { batches: Uint8Array[]; oversize: number } {
  const batches: Uint8Array[] = [];
  let oversize = 0;
  let group: Uint8Array[] = [];
  let size = 0;
  const close = () => {
    if (group.length === 0) return;
    const merged = group.length === 1 ? group[0] : Y.mergeUpdates(group);
    // A merge that grew past the cap sends the group as it came: each update fits.
    if (merged.length <= cap) batches.push(merged);
    else batches.push(...group);
    group = [];
    size = 0;
  };
  for (const update of updates) {
    if (update.length > cap) {
      oversize++;
      continue;
    }
    if (size + update.length > cap) close();
    group.push(update);
    size += update.length;
  }
  close();
  return { batches, oversize };
}

/**
 * The HTTP link of one connection's document. Its ledger: a post's 200 is that update's `Saved`, and the handshake's
 * 200 proves the server holds the whole document as it stood when the handshake was encoded. One post is in flight at
 * a time, and none is aborted: a 200 that arrives after the link left still proves the rows it covered.
 */
export function createHttpLink(conn: YjsConnection, scope: HttpLinkScope, hooks: HttpLinkHooks): HttpLink {
  const doc = conn.yDoc;

  // Bumped by each enter and leave: a request of an earlier session settles, but changes nothing past its proof.
  let session = 0;
  let active = false;
  let entering: Promise<boolean> | null = null;
  // Pending until the server proves it holds the document; held when the document is too large to post.
  let handshake: 'pending' | 'proven' | 'held' = 'pending';
  // The server's state vector as the last pull answered it.
  let serverVector: Uint8Array | undefined;
  // Local edits the handshake did not cover, waiting for a post.
  let queued: Uint8Array[] = [];
  // A queued edit too large to post: it waits for the socket.
  let oversized = false;
  let posting = false;
  let inFlight = 0;
  let pulling: { session: number; done: Promise<boolean> } | null = null;
  let lastPullAt = Number.NEGATIVE_INFINITY;
  // The current session's entering pull answered, so its handshake may be encoded.
  let entered = false;
  let pullTimer: ReturnType<typeof setInterval> | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
  // Backoffs being waited out, which a leave ends at once.
  const backoffs = new Set<() => void>();

  const isCurrent = (s: number) => active && s === session;

  /** Waits out a backoff; false when the link left meanwhile. */
  const wait = (ms: number, s: number) =>
    new Promise<boolean>((resolve) => {
      const cancel = () => {
        clearTimeout(timer);
        resolve(false);
      };
      const timer = setTimeout(() => {
        backoffs.delete(cancel);
        resolve(isCurrent(s));
      }, ms);
      backoffs.add(cancel);
    });

  /** A final answer: the link leaves, and the connection ends or rebuilds. */
  const finish = (reason: UnsaveableReason) => {
    link.leave();
    hooks.end(reason);
  };

  const requestPull = async (s: number): Promise<boolean> => {
    lastPullAt = Date.now();
    try {
      const answer = await pullYjsDiff(scope, Y.encodeStateVector(doc));
      if (!isCurrent(s)) return false;
      // The first answer names the document's generation, as the relay's `Generation` frame does; another one later
      // means the server reseeded the document.
      if (conn.generation === null) conn.generation = answer.generation;
      else if (answer.generation !== conn.generation) {
        finish('replaced');
        return false;
      }
      applyRemoteUpdate(conn, answer.update, { kind: 'http' });
      serverVector = answer.stateVector;
      return true;
    } catch (error) {
      if (!isCurrent(s)) return false;
      const failure = classify(error);
      if (failure.kind === 'end') finish(failure.reason);
      return false;
    }
  };

  /** One pull at a time per session: true once its diff is applied. */
  const pullOnce = (s: number): Promise<boolean> => {
    if (pulling?.session === s) return pulling.done;
    const current = { session: s, done: requestPull(s) };
    pulling = current;
    void current.done.then(() => {
      if (pulling === current) pulling = null;
    });
    return current.done;
  };

  /** Pulls until the API answers, backing off between failures; false once the link left or a final answer ended it. */
  const pullUntilAnswered = async (s: number) => {
    for (let attempt = 0; isCurrent(s); attempt++) {
      if (await pullOnce(s)) return isCurrent(s);
      if (!isCurrent(s) || !(await wait(retryDelay(attempt), s))) return false;
    }
    return false;
  };

  /** Posts one update until the server holds it: true on its 200, also after the link left; false once the link left or a final answer ended it. */
  const post = async (update: Uint8Array, s: number): Promise<boolean> => {
    const generation = conn.generation;
    // A pull precedes every post and sets the generation.
    if (generation === null) return false;
    inFlight++;
    try {
      let pulledForConflict = false;
      for (let attempt = 0; ; attempt++) {
        try {
          await pushYjsDiff(scope, generation, update);
          return true;
        } catch (error) {
          // The link left: the failure is ignored, and the next handshake carries the document.
          if (!isCurrent(s)) return false;
          const failure = classify(error);
          if (failure.kind === 'end') {
            finish(failure.reason);
            return false;
          }
          if (failure.kind === 'conflict' && failure.generation !== null) {
            finish('replaced');
            return false;
          }
          // No document: the pull seeds it, and the post goes again at once.
          if (failure.kind === 'conflict' && !pulledForConflict) {
            pulledForConflict = true;
            if (await pullUntilAnswered(s)) continue;
            return false;
          }
          if (!(await wait(retryDelay(attempt), s))) return false;
        }
      }
    } finally {
      inFlight--;
    }
  };

  /** The rows and state vector a handshake proves, as they stand when it is encoded. */
  const snapshot = () => ({ applied: { upTo: conn.applied.upTo, ids: new Set(conn.applied.ids) }, vector: Y.encodeStateVector(doc) });

  /**
   * Posts what the server lacks after the entering pull. With nothing unsynced it is proven at once. Too large for one
   * post, the queued edits go first in batches, then a pull and the rest as one diff; a rest still too large holds it.
   */
  const runHandshake = async (s: number): Promise<boolean> => {
    const backlog = queued;
    queued = [];
    if (!conn.unsynced) {
      handshake = 'proven';
      return true;
    }
    let proof = snapshot();
    let update = Y.encodeStateAsUpdate(doc, serverVector);
    if (update.length > HTTP_CHUNK_BYTES) {
      for (const batch of batchUpdates(backlog).batches) {
        if (!(await post(batch, s)) || !isCurrent(s)) return false;
      }
      // A pull that went out before the batches answers a vector without them.
      if (pulling) await pulling.done;
      if (!(await pullUntilAnswered(s))) return false;
      proof = snapshot();
      update = Y.encodeStateAsUpdate(doc, serverVector);
      if (update.length > HTTP_CHUNK_BYTES) {
        if (s === session) handshake = 'held';
        return false;
      }
    }
    if (!(await post(update, s))) return false;
    if (conn.yDoc === doc) {
      conn.writer?.prove({ kind: 'handshake', ...proof }).catch((error) => console.error('[yjs] Storing the HTTP handshake proof failed', error));
    }
    if (s === session) handshake = 'proven';
    return isCurrent(s);
  };

  /** Posts one at a time: the handshake first, then queued edits in batches. */
  const pump = async (s: number) => {
    if (posting) return;
    posting = true;
    try {
      if (handshake === 'pending' && !(await runHandshake(s))) return;
      while (isCurrent(s) && handshake === 'proven' && queued.length > 0) {
        clearPushTimers();
        const { batches, oversize } = batchUpdates(queued);
        queued = [];
        if (oversize > 0) oversized = true;
        for (const batch of batches) {
          if (!(await post(batch, s))) return;
        }
      }
    } finally {
      posting = false;
      hooks.onChange();
      // A session entered while this one still posted found the pump busy; its turn comes now.
      if (active && entered && session !== s) void pump(session);
    }
  };

  const clearPushTimers = () => {
    clearTimeout(debounceTimer);
    clearTimeout(maxWaitTimer);
    debounceTimer = undefined;
    maxWaitTimer = undefined;
  };

  const flush = (s: number) => {
    clearPushTimers();
    if (isCurrent(s)) void pump(s);
  };

  const schedule = (s: number) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => flush(s), HTTP_PUSH_DEBOUNCE_MS);
    maxWaitTimer ??= setTimeout(() => flush(s), HTTP_PUSH_MAX_WAIT_MS);
  };

  // Pulls are for an editor someone looks at: a connection kept only to save its edits pulls nothing.
  const pullForEditor = () => {
    if (active && conn.refCount > 0 && document.visibilityState === 'visible') void pullOnce(session);
  };
  const onFocus = () => {
    if (Date.now() - lastPullAt >= HTTP_PULL_GAP_MS) pullForEditor();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') onFocus();
  };

  const link: HttpLink = {
    enter() {
      if (active) return entering ?? Promise.resolve(true);
      active = true;
      const s = ++session;
      handshake = 'pending';
      oversized = false;
      entering = (async () => {
        if (!(await pullUntilAnswered(s))) return false;
        entered = true;
        pullTimer = setInterval(pullForEditor, HTTP_PULL_MS);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);
        void pump(s);
        return true;
      })();
      return entering;
    },
    leave() {
      active = false;
      session++;
      entering = null;
      entered = false;
      handshake = 'pending';
      oversized = false;
      queued = [];
      clearPushTimers();
      clearInterval(pullTimer);
      pullTimer = undefined;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const cancel of backoffs) cancel();
      backoffs.clear();
    },
    queue(update) {
      queued.push(update);
      if (active && handshake === 'proven') schedule(session);
    },
    async pull() {
      if (active) await pullOnce(session);
    },
    get clean() {
      return handshake === 'proven' && !oversized && !posting && inFlight === 0 && queued.length === 0;
    },
  };
  return link;
}
