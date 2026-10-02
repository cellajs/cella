import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import * as decoding from 'lib0/decoding';
import { useEffect, useState } from 'react';
import { appConfig, type ProductEntityType } from 'shared';
import { toWsUrl } from 'shared/utils/ws-url';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { create } from 'zustand';
import type { TKey } from '~/lib/i18n-locales';
import { isYjsTokenRefusal, yjsTokenKeys, yjsTokenQueryOptions } from '~/modules/common/blocknote/query';
import { watchPendingStructs } from '~/modules/common/blocknote/yjs-resync';
import { toaster } from '~/modules/common/toaster/toaster';
import { useUserStore, yjsTokenKey } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';

const GRACE_PERIOD_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;
/** How long a socket waits for its first `Saved` after its handshake Step2, before it takes the relay for one that sends none. */
const SAVED_FALLBACK_MS = 10_000;

// Distinct tokens the relay refused, with no synced connection between them, before the connection stops for good.
const MAX_TOKEN_FAILURES = 5;

/** WebSocket close codes sent by the Yjs relay; the 4000-4999 range is reserved for application use. */
const YJS_CLOSE = { TOKEN_INVALID: 4001, ACCESS_DENIED: 4003, BAD_REQUEST: 4400 } as const;

/**
 * Message types on the socket: y-websocket's sync, and the relay's own next to sync and awareness (1). `Generation` is
 * the document's generation, sent before every handshake answer; `Saved` is the relay's empty answer, to the sender
 * alone, to each sync Step2 or Update it handled. Must match yjs/src/sync/relay.ts.
 */
const YJS_MESSAGE = { SYNC: 0, GENERATION: 4, SAVED: 5 } as const;
/** The sync subtypes the relay answers with `Saved`. */
const YJS_SYNC = { STEP2: 1, UPDATE: 2 } as const;

/**
 * Closes after which no reconnect can succeed: access denied, a document or update the relay refuses, and a frame
 * too big for the relay, which a reconnect would send again. Every other close is transient: y-websocket backs off,
 * reconnects with the current token and resyncs, so edits made meanwhile reach the relay.
 */
const FINAL_CLOSES: ReadonlyMap<number, TKey> = new Map<number, TKey>([
  [YJS_CLOSE.ACCESS_DENIED, 'error:no_permission_for_sync.text'],
  [YJS_CLOSE.BAD_REQUEST, 'error:sync_failed.text'],
  [1009, 'error:sync_failed.text'],
]);

/**
 * What the current socket sent that the relay confirms, and what it confirmed. The relay answers each sync Step2 and
 * Update with one `Saved`, in the order it handled them, or closes the socket, and the handshake's Step2 carries every
 * edit the relay lacked. So once that Step2 is saved and the counts match, the relay holds every edit of the document.
 * A new socket starts afresh: what the last one left unconfirmed travels in the next handshake's Step2.
 */
interface SocketLedger {
  /** Step2 and Update frames sent on the socket. */
  sent: number;
  /** `Saved` frames received on it. */
  saved: number;
  /** The `sent` count that includes the handshake's Step2; 0 until it went out. */
  handshakeAt: number;
  /** No `Saved` came within SAVED_FALLBACK_MS of the handshake Step2: a relay that sends none, so y-websocket's `synced` stands in. */
  legacy: boolean;
  fallbackTimer?: ReturnType<typeof setTimeout>;
  /** Re-evaluates the connection once the ledger changed; bound with the provider. */
  onChange: () => void;
}

interface YjsConnection {
  yDoc: Y.Doc;
  provider: WebsocketProvider;
  fragment: Y.XmlFragment;
  ledger: SocketLedger;
  refCount: number;
  /** Set once the relay ended the session for good; a stopped connection never reconnects and is not reused. */
  stopped: boolean;
  /** The generation the relay announced for the document at its first handshake; another one later means the document was reseeded. */
  generation: string | null;
  /**
   * True from a local edit until the relay saved every edit of the document. Such a connection outlives its grace period
   * and holds the page's unload, and a rebuild says that it discarded them.
   */
  unsynced: boolean;
  graceTimer?: ReturnType<typeof setTimeout>;
  unsubOnline?: () => void;
  unsubToken?: () => void;
  /** Stops the parked-structs watch that resyncs a document stuck on a lost update. */
  stopResyncWatch?: () => void;
}

/** Module-level connection map; mutations happen outside React render. */
const connections = new Map<string, YjsConnection>();

interface YjsSyncState {
  /** editSessionId → synced boolean; back to false while a reseeded document syncs afresh */
  synced: Record<string, boolean>;
  /** editSessionId → true once its connection stopped for good */
  stopped: Record<string, boolean>;
  /** editSessionId → how often its document was rebuilt after a reseed; the editor remounts on the new fragment */
  rebuilds: Record<string, number>;
  /** editSessionId → true while its document holds local edits the relay has not saved */
  unsynced: Record<string, boolean>;
}

const useYjsSyncStore = create<YjsSyncState>(() => ({ synced: {}, stopped: {}, rebuilds: {}, unsynced: {} }));

/** Asks before the page unloads: edits the relay has not saved live only in this tab. */
function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (appConfig.mode === 'development') return console.info('[yjs] Beforeunload warning is triggered but not shown in dev mode.');
  event.preventDefault();
}

let unloadGuarded = false;

/** Registers the unload warning while some connection holds unsynced edits, and only then. */
function guardUnload() {
  const needed = [...connections.values()].some((conn) => conn.unsynced);
  if (needed === unloadGuarded) return;
  unloadGuarded = needed;
  if (needed) window.addEventListener('beforeunload', warnBeforeUnload);
  else window.removeEventListener('beforeunload', warnBeforeUnload);
}

function setUnsynced(editSessionId: string, conn: YjsConnection, unsynced: boolean) {
  if (conn.unsynced === unsynced) return;
  conn.unsynced = unsynced;
  useYjsSyncStore.setState((s) => ({ unsynced: { ...s.unsynced, [editSessionId]: unsynced } }));
  guardUnload();
}

/** The relay has `SAVED_FALLBACK_MS` from the handshake Step2 to send this socket's first `Saved`. */
function armSavedFallback(ledger: SocketLedger) {
  if (ledger.saved > 0) return;
  ledger.fallbackTimer = setTimeout(() => {
    ledger.legacy = true;
    ledger.onChange();
  }, SAVED_FALLBACK_MS);
}

/** The sync subtype of a frame y-websocket sends; null for any other message. */
function syncSubtype(data: unknown): number | null {
  if (!(data instanceof Uint8Array) || data.length < 2) return null;
  const decoder = decoding.createDecoder(data);
  if (decoding.readVarUint(decoder) !== YJS_MESSAGE.SYNC) return null;
  return decoding.readVarUint(decoder);
}

/**
 * The provider's WebSocket, which counts the Step2 and Update frames it sends into the connection's ledger. y-websocket
 * creates one per connection attempt, so each new socket starts the ledger afresh.
 */
function ledgerSocket(ledger: SocketLedger): typeof WebSocket {
  return class LedgerSocket extends WebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      clearTimeout(ledger.fallbackTimer);
      Object.assign(ledger, { sent: 0, saved: 0, handshakeAt: 0, legacy: false, fallbackTimer: undefined });
    }

    send(data: Parameters<WebSocket['send']>[0]) {
      super.send(data);
      const subtype = syncSubtype(data);
      if (subtype !== YJS_SYNC.STEP2 && subtype !== YJS_SYNC.UPDATE) return;
      ledger.sent++;
      if (subtype === YJS_SYNC.STEP2 && ledger.handshakeAt === 0) {
        ledger.handshakeAt = ledger.sent;
        armSavedFallback(ledger);
      }
    }
  };
}

/**
 * True once the relay holds every edit of the document: the socket is open, its handshake Step2 was saved, and so was
 * every frame after it. Against a relay that sends no `Saved`, the best proof there is: synced, with the handshake
 * Step2 sent.
 */
function isClean(provider: WebsocketProvider, ledger: SocketLedger) {
  if (!provider.wsconnected || provider.ws?.readyState !== WebSocket.OPEN || ledger.handshakeAt === 0) return false;
  if (ledger.legacy) return provider.synced;
  return ledger.saved === ledger.sent;
}

/**
 * Ends a connection for good: no reconnect, and its editor turns read-only (useYjsConnection reports `stopped`), so
 * nothing typed after this is lost unsynced. `message` is the toast naming the reason, if any.
 */
function stopConnection(editSessionId: string, conn: YjsConnection, message: TKey | null) {
  if (conn.stopped) return;
  conn.stopped = true;
  conn.provider.disconnect();
  useYjsSyncStore.setState((s) => ({ stopped: { ...s.stopped, [editSessionId]: true } }));
  if (message) toaster.warning(i18n.t(message));
}

/** A fresh document and its provider for the entity's session, connecting with the token held for it. */
function openDoc(editSessionId: string, entityType: ProductEntityType, tenantId: string) {
  const serverUrl = toWsUrl(appConfig.yjsUrl!);
  // The session is the entity's document, and a token opens that one document only.
  const token = useUserStore.getState().yjsTokens[yjsTokenKey(entityType, editSessionId)];
  if (!token) throw new Error(`[yjs] No token available for ${entityType}:${editSessionId}`);

  const yDoc = new Y.Doc();
  const ledger: SocketLedger = { sent: 0, saved: 0, handshakeAt: 0, legacy: false, onChange: () => {} };
  const provider = new WebsocketProvider(serverUrl, editSessionId, yDoc, {
    params: { token, entityType, tenantId },
    connect: onlineManager.isOnline() !== false,
    maxBackoffTime: MAX_BACKOFF_MS,
    WebSocketPolyfill: ledgerSocket(ledger),
  });
  return { yDoc, provider, fragment: yDoc.getXmlFragment('document-store'), ledger };
}

/**
 * Listens on the connection's document and provider: keeps the token current, ends the connection for good on a
 * final close, rebuilds it when the relay reseeded the document, reports the first sync, and tracks the edits the relay
 * has not saved yet.
 */
function bindProvider(editSessionId: string, conn: YjsConnection, entityType: ProductEntityType, tenantId: string, organizationId: string) {
  const { provider, yDoc, ledger } = conn;
  const tokenKey = yjsTokenKey(entityType, editSessionId);

  // Clears `unsynced` once the relay holds every edit, then lets a connection whose grace period ran out meanwhile go.
  const settle = () => {
    if (conn.provider !== provider || !conn.unsynced || !isClean(provider, ledger)) return;
    setUnsynced(editSessionId, conn, false);
    reapConnection(editSessionId, conn);
  };
  ledger.onChange = settle;

  // A withdrawn token stays withdrawn across an offline blip: reconnect only while one is held.
  conn.unsubOnline = onlineManager.subscribe((isOnline) => {
    if (!isOnline) provider.disconnect();
    else if (!conn.stopped && useUserStore.getState().yjsTokens[tokenKey]) provider.connect();
  });

  // Keep provider params on the latest token so a reconnect (after sleep, or the relay's close at expiry) uses a fresh one.
  conn.unsubToken = useUserStore.subscribe((state, prevState) => {
    const newToken = state.yjsTokens[tokenKey];
    if (newToken) {
      if (provider.params) (provider.params as Record<string, string>).token = newToken;
      return;
    }
    // Withdrawn (access revoked, the entity gone, or signed out), also while offline: the token cannot come back.
    if (prevState.yjsTokens[tokenKey]) {
      // Signed out: unsaved edits go with the session, as the user's local database does, and no later user sees them.
      // TODO(offline): decide again whether sign-out discards unsaved edits, or asks first while some are unsaved, once documents are stored offline.
      if (!state.user) setUnsynced(editSessionId, conn, false);
      stopConnection(editSessionId, conn, state.user ? 'error:no_permission_for_sync.text' : null);
      reapConnection(editSessionId, conn);
    }
  });

  // The token each attempt carries: y-websocket reads the params as it opens a socket, then reports 'connecting'.
  let attemptToken = provider.params.token;
  provider.on('status', ({ status }) => {
    if (status === 'connecting') attemptToken = provider.params.token;
  });

  // Tokens refused since the last synced connection: the relay closes an unusable token right after the handshake, so
  // a connection that merely opened proves nothing.
  const refusedTokens = new Set<string>();
  provider.on('sync', (isSynced: boolean) => {
    if (!isSynced) return;
    refusedTokens.clear();
    settle();
  });

  provider.on('connection-close', (event: CloseEvent | null) => {
    // A local close carries no event; it and every transient close reconnect with backoff.
    if (!event || conn.stopped) return;

    // The relay closes an expired or invalid token with 4001, and the refetch this starts reaches the provider params
    // before a later reconnect. Only distinct tokens count: while the API is unreachable every reconnect carries the
    // expired token again, and that must not end collaboration for good once the API is back.
    if (event.code === YJS_CLOSE.TOKEN_INVALID) {
      refusedTokens.add(attemptToken);
      const tokenQueryKey = yjsTokenKeys.entity(entityType, editSessionId);
      void queryClient.invalidateQueries({ queryKey: tokenQueryKey });
      // An open editor's token query refetches on the invalidation. A connection kept only for unsaved edits has none
      // observing the key, so it fetches its own token, and a refusal withdraws it like the query's would.
      if (!queryClient.getQueryCache().find({ queryKey: tokenQueryKey })?.getObserversCount()) {
        queryClient
          .fetchQuery(yjsTokenQueryOptions({ entityType, entityId: editSessionId, tenantId, organizationId }))
          .then((token) => useUserStore.getState().setYjsToken(tokenKey, token))
          .catch((error) => {
            if (isYjsTokenRefusal(error)) useUserStore.getState().setYjsToken(tokenKey, null);
          });
      }
      if (refusedTokens.size < MAX_TOKEN_FAILURES) return;
      console.warn(`[yjs] Circuit breaker: ${refusedTokens.size} tokens refused in a row for ${editSessionId}`);
      stopConnection(editSessionId, conn, 'error:sync_token_expired.text');
      return;
    }

    const message = FINAL_CLOSES.get(event.code);
    if (message) stopConnection(editSessionId, conn, message);
  });

  // The relay announces the document's generation before it answers a handshake. The first one is the document's;
  // another one later means the relay reseeded it (its description was written outside the relay), and this document
  // shares no history with the new one: it is dropped here, before y-websocket merges or uploads anything of it. Edits
  // the relay never saved go with it, and the rebuild says so.
  provider.messageHandlers[YJS_MESSAGE.GENERATION] = (_encoder, decoder) => {
    const generation = decoding.readVarString(decoder);
    if (conn.generation === null) conn.generation = generation;
    else if (conn.generation !== generation) rebuildConnection(editSessionId, conn, entityType, tenantId, organizationId);
  };

  // One per Step2 or Update this socket sent, in order. Any `Saved` proves the relay sends them.
  provider.messageHandlers[YJS_MESSAGE.SAVED] = () => {
    ledger.saved++;
    ledger.legacy = false;
    clearTimeout(ledger.fallbackTimer);
    settle();
  };

  // A local edit stays unsynced until the relay saved it: y-websocket sends it at once while connected, otherwise the
  // next handshake's Step2 carries it. Settled a microtask later, once y-websocket's own listener sent it.
  yDoc.on('update', (_update: Uint8Array, origin: unknown) => {
    if (origin === provider) return;
    setUnsynced(editSessionId, conn, true);
    queueMicrotask(settle);
  });

  conn.stopResyncWatch = watchPendingStructs(yDoc, provider);

  const handleSync = (isSynced: boolean) => {
    if (!isSynced) return;
    provider.off('sync', handleSync);
    useYjsSyncStore.setState((s) => ({ synced: { ...s.synced, [editSessionId]: true } }));
  };

  if (provider.synced) {
    useYjsSyncStore.setState((s) => ({ synced: { ...s.synced, [editSessionId]: true } }));
  } else {
    provider.on('sync', handleSync);
  }
}

/** Ends the connection's provider and document. */
function unbindProvider(conn: YjsConnection) {
  conn.unsubOnline?.();
  conn.unsubToken?.();
  conn.stopResyncWatch?.();
  clearTimeout(conn.ledger.fallbackTimer);
  conn.provider.destroy();
  conn.yDoc.destroy();
}

/**
 * Replaces the connection's document with a fresh one that syncs the reseeded server state. The editor remounts on
 * the new fragment once it synced (useYjsConnection reports `synced` false meanwhile), and the user is told when the
 * dropped document held edits the relay never saved, since the description they see next is the one written elsewhere.
 * A connection that only waited for those edits to be saved has nothing left to wait for, and goes.
 */
function rebuildConnection(editSessionId: string, conn: YjsConnection, entityType: ProductEntityType, tenantId: string, organizationId: string) {
  const { unsynced } = conn;
  setUnsynced(editSessionId, conn, false);
  if (conn.refCount === 0 && !conn.graceTimer) destroyConnection(editSessionId, conn);
  else {
    unbindProvider(conn);
    Object.assign(conn, openDoc(editSessionId, entityType, tenantId), { generation: null });
    useYjsSyncStore.setState((s) => ({
      synced: { ...s.synced, [editSessionId]: false },
      rebuilds: { ...s.rebuilds, [editSessionId]: (s.rebuilds[editSessionId] ?? 0) + 1 },
    }));
    bindProvider(editSessionId, conn, entityType, tenantId, organizationId);
  }
  if (unsynced) toaster.warning(i18n.t('error:sync_document_replaced.text'));
}

function acquireConnection(editSessionId: string, entityType: ProductEntityType, tenantId: string, organizationId: string): YjsConnection {
  const existing = connections.get(editSessionId);

  if (existing) {
    if (existing.graceTimer) {
      clearTimeout(existing.graceTimer);
      existing.graceTimer = undefined;
    }
    existing.refCount++;
    return existing;
  }

  const conn: YjsConnection = { ...openDoc(editSessionId, entityType, tenantId), refCount: 1, stopped: false, generation: null, unsynced: false };
  bindProvider(editSessionId, conn, entityType, tenantId, organizationId);
  connections.set(editSessionId, conn);
  return conn;
}

function destroyConnection(editSessionId: string, conn: YjsConnection) {
  if (connections.get(editSessionId) !== conn) return;
  unbindProvider(conn);
  connections.delete(editSessionId);
  guardUnload();
  useYjsSyncStore.setState((s) => {
    const { [editSessionId]: _synced, ...synced } = s.synced;
    const { [editSessionId]: _stopped, ...stopped } = s.stopped;
    const { [editSessionId]: _rebuilds, ...rebuilds } = s.rebuilds;
    const { [editSessionId]: _unsynced, ...unsynced } = s.unsynced;
    return { synced, stopped, rebuilds, unsynced };
  });
}

/**
 * Destroys a connection no editor holds once its grace period is over, unless it holds edits the relay has not saved:
 * those live only in its document, so it stays, reconnecting, until the relay saved them. A stopped connection never
 * gets there, and keeps them for the editor to show again.
 */
function reapConnection(editSessionId: string, conn: YjsConnection) {
  if (conn.refCount > 0 || conn.graceTimer || conn.unsynced) return;
  destroyConnection(editSessionId, conn);
}

function releaseConnection(editSessionId: string) {
  const conn = connections.get(editSessionId);
  if (!conn) return;

  conn.refCount--;
  if (conn.refCount > 0) return;
  // A stopped connection holds nothing to reuse, so reopening the editor starts a fresh one; unless it holds unsaved
  // edits, which the reopened editor shows again.
  if (conn.stopped) return reapConnection(editSessionId, conn);
  conn.graceTimer = setTimeout(() => {
    conn.graceTimer = undefined;
    reapConnection(editSessionId, conn);
  }, GRACE_PERIOD_MS);
}

/**
 * Ref-counted Yjs connection kept alive for a grace period after the last consumer unmounts, so a remount reuses it,
 * and after that for as long as it holds edits the relay has not saved; `undefined` disables it. `stopped` turns true
 * once the relay ended the session for good: the editor must go read-only. `synced` drops back to false while a
 * reseeded document syncs afresh, and `rebuilds` counts those, so the editor remounts on the new fragment. `unsynced`
 * is true while the document holds local edits the relay has not saved.
 */
export function useYjsConnection(editSessionId: string | undefined, entityType: ProductEntityType, tenantId: string, organizationId: string) {
  const [conn, setConn] = useState<YjsConnection | null>(() => {
    return editSessionId ? (connections.get(editSessionId) ?? null) : null;
  });

  useEffect(() => {
    if (!editSessionId) {
      setConn(null);
      return;
    }
    const acquired = acquireConnection(editSessionId, entityType, tenantId, organizationId);
    setConn(acquired);
    return () => {
      releaseConnection(editSessionId);
      setConn(null);
    };
  }, [editSessionId, entityType, tenantId, organizationId]);

  const synced = useYjsSyncStore((s) => s.synced[editSessionId ?? ''] ?? false);
  const stopped = useYjsSyncStore((s) => s.stopped[editSessionId ?? ''] ?? false);
  const rebuilds = useYjsSyncStore((s) => s.rebuilds[editSessionId ?? ''] ?? 0);
  const unsynced = useYjsSyncStore((s) => s.unsynced[editSessionId ?? ''] ?? false);

  if (!conn) return null;
  return { provider: conn.provider, fragment: conn.fragment, synced, stopped, rebuilds, unsynced };
}
