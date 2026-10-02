import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import * as decoding from 'lib0/decoding';
import { useEffect, useState } from 'react';
import { appConfig, type ProductEntityType } from 'shared';
import { toWsUrl } from 'shared/utils/ws-url';
import { Awareness } from 'y-protocols/awareness';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { create } from 'zustand';
import type { TKey } from '~/lib/i18n-locales';
import { yjsTokenKeys, yjsTokenQueryOptions, yjsTokenRefusal } from '~/modules/common/blocknote/query';
import { createHttpLink, type HttpLink, WS_SYNC_DEADLINE_MS } from '~/modules/common/blocknote/yjs-http';
import { watchPendingStructs } from '~/modules/common/blocknote/yjs-resync';
import type { AppliedRows, YDocWriter } from '~/modules/common/blocknote/yjs-store';
import { toaster } from '~/modules/common/toaster/toaster';
import { useUserStore, yjsTokenKey } from '~/modules/user/user-store';
import type { UnsaveableReason } from '~/query/local-user-db';
import { queryClient } from '~/query/query-client';

const GRACE_PERIOD_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;
/** How long a socket waits for its first `Saved` after its handshake Step2, before it takes the relay for one that sends none. */
const SAVED_FALLBACK_MS = 10_000;

// Distinct tokens the relay refused, with no synced connection between them, before the connection stops for good.
const MAX_TOKEN_FAILURES = 5;

/** WebSocket close codes sent by the Yjs relay; the 4000-4999 range is reserved for application use. */
const YJS_CLOSE = { TOKEN_INVALID: 4001, ACCESS_DENIED: 4003, BAD_REQUEST: 4400, ENTITY_DELETED: 4410 } as const;

/**
 * Message types on the socket: y-websocket's sync, and the relay's own next to sync and awareness (1). `Generation` is
 * the document's generation, sent before every handshake answer; `Saved` is the relay's empty answer, to the sender
 * alone, to each sync Step2 or Update it handled. Must match yjs/src/sync/relay.ts.
 */
const YJS_MESSAGE = { SYNC: 0, GENERATION: 4, SAVED: 5 } as const;
/** The sync subtypes the relay answers with `Saved`. */
const YJS_SYNC = { STEP2: 1, UPDATE: 2 } as const;

/**
 * Why a connection stopped for good: edit rights withdrawn (`denied`), a document or update the relay or the HTTP
 * routes refuse (`refused`), or tokens the relay kept refusing (`expired`).
 */
export type YjsStopReason = 'denied' | 'refused' | 'expired';

const STOP_MESSAGES: Record<YjsStopReason, TKey> = {
  denied: 'error:no_permission_for_sync.text',
  refused: 'error:sync_failed.text',
  expired: 'error:sync_token_expired.text',
};

/**
 * Closes after which no reconnect can succeed: access denied, a document or update the relay refuses, and a frame
 * too big for the relay, which a reconnect would send again. Every other close is transient: y-websocket backs off,
 * reconnects with the current token and resyncs, so edits made meanwhile reach the relay.
 */
const FINAL_CLOSES: ReadonlyMap<number, YjsStopReason> = new Map<number, YjsStopReason>([
  [YJS_CLOSE.ACCESS_DENIED, 'denied'],
  [YJS_CLOSE.BAD_REQUEST, 'refused'],
  [1009, 'refused'],
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
  /** The socket's `Generation` frame arrived and matched; sync frames before it are dropped. */
  generationSeen: boolean;
  /** The relay saved the handshake's Step2, so it holds every edit the document held when the Step2 went out. */
  handshakeProven: boolean;
  fallbackTimer?: ReturnType<typeof setTimeout>;
  /** Re-evaluates the connection once the ledger changed; bound with the provider. */
  onChange: () => void;
  /** Runs as the handshake's Step2 goes out, before the relay can answer it. */
  onHandshakeSent: () => void;
}

/** The transport syncing a connection's document: the relay's socket, the API's HTTP routes, or none yet. */
export type YjsTransport = 'none' | 'ws' | 'http';

/** One entity's collaborative document and everything that syncs, stores and shows it. */
export interface YjsConnection {
  yDoc: Y.Doc;
  /**
   * Cursors and presence. The connection owns it and hands it to the provider, so the editor binds one that lives as
   * long as the document, whatever transport carries it.
   */
  awareness: Awareness;
  provider: WebsocketProvider;
  fragment: Y.XmlFragment;
  ledger: SocketLedger;
  /** What carries the document's edits now; `isClean` asks that transport. */
  transport: YjsTransport;
  /** True once the stored document, if any, was applied: the provider connects only then, so its Step1 carries it. */
  loaded: boolean;
  /** True once the editor may mount: synced over either transport, or loaded from storage. */
  ready: boolean;
  /** True once the document is kept in the per-user database: opened for editing. */
  stored: boolean;
  /** Writes the document's updates to the per-user database; null while it is not stored, or without a database. */
  writer: YDocWriter | null;
  /** The HTTP transport, which carries the document while the relay is out of reach; created as the provider is bound. */
  http: HttpLink | null;
  /** The stored update rows the document holds, which a saved handshake proves the server holds too. */
  applied: AppliedRows;
  /** Runs out when the socket has not synced in time after starting, and HTTP takes over if the API answers. */
  wsDeadline?: ReturnType<typeof setTimeout>;
  refCount: number;
  /** Set once the relay ended the session for good; a stopped connection never reconnects and is not reused. */
  stopped: boolean;
  /**
   * The generation the relay announced for the document at its first handshake. Another one later means the relay
   * reseeded the document: after a delete and a restore, or a lost document row.
   */
  generation: string | null;
  /**
   * True from a local edit until the relay saved every edit of the document. Such a connection outlives its grace period
   * and holds the page's unload, and a rebuild or a deletion says that it discarded them.
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
  /** editSessionId → why its connection stopped, when a final answer said so */
  stopReason: Record<string, YjsStopReason>;
  /** editSessionId → true once its editor may mount: synced over either transport, or loaded from storage */
  ready: Record<string, boolean>;
  /** editSessionId → the transport carrying its edits */
  transport: Record<string, YjsTransport>;
  /** editSessionId → how often its document was rebuilt after a reseed; the editor remounts on the new fragment */
  rebuilds: Record<string, number>;
  /** editSessionId → true while its document holds local edits the relay has not saved */
  unsynced: Record<string, boolean>;
  /** editSessionId → true once its entity was deleted; its connection stopped with it */
  deleted: Record<string, boolean>;
}

const useYjsSyncStore = create<YjsSyncState>(() => ({
  synced: {},
  stopped: {},
  stopReason: {},
  ready: {},
  transport: {},
  rebuilds: {},
  unsynced: {},
  deleted: {},
}));

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

/** Lets the connection's editor mount: synced over either transport, or loaded from storage. Stays until a rebuild. */
function setReady(editSessionId: string, conn: YjsConnection) {
  if (conn.ready) return;
  conn.ready = true;
  useYjsSyncStore.setState((s) => ({ ready: { ...s.ready, [editSessionId]: true } }));
}

function setTransport(editSessionId: string, conn: YjsConnection, transport: YjsTransport) {
  if (conn.transport === transport) return;
  conn.transport = transport;
  useYjsSyncStore.setState((s) => ({ transport: { ...s.transport, [editSessionId]: transport } }));
}

/** Offline, or stopped: no transport carries an edit, so the deadline goes and HTTP leaves. Back online, the provider's next attempt rearms it. */
function pauseTransports(editSessionId: string, conn: YjsConnection) {
  clearTimeout(conn.wsDeadline);
  conn.wsDeadline = undefined;
  conn.http?.leave();
  setTransport(editSessionId, conn, 'none');
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
      Object.assign(ledger, {
        sent: 0,
        saved: 0,
        handshakeAt: 0,
        legacy: false,
        generationSeen: false,
        handshakeProven: false,
        fallbackTimer: undefined,
      });
    }

    send(data: Parameters<WebSocket['send']>[0]) {
      super.send(data);
      const subtype = syncSubtype(data);
      if (subtype !== YJS_SYNC.STEP2 && subtype !== YJS_SYNC.UPDATE) return;
      ledger.sent++;
      if (subtype === YJS_SYNC.STEP2 && ledger.handshakeAt === 0) {
        ledger.handshakeAt = ledger.sent;
        armSavedFallback(ledger);
        ledger.onHandshakeSent();
      }
    }
  };
}

/**
 * True once the relay holds every edit of the document: the socket is open, its handshake Step2 was saved, and so was
 * every frame after it. Against a relay that sends no `Saved`, the best proof there is: synced, with the handshake
 * Step2 sent.
 */
function isSocketClean(provider: WebsocketProvider, ledger: SocketLedger) {
  if (!provider.wsconnected || provider.ws?.readyState !== WebSocket.OPEN || ledger.handshakeAt === 0) return false;
  if (ledger.legacy) return provider.synced;
  return ledger.saved === ledger.sent;
}

/** True once the server holds every edit of the document, as the transport carrying them proves it. */
function isClean(conn: YjsConnection) {
  if (conn.transport === 'http') return conn.http?.clean ?? false;
  return isSocketClean(conn.provider, conn.ledger);
}

/** Where an update applied with the provider as origin came from: the relay, unless {@link applyRemoteUpdate} says otherwise. */
export type RemoteSource = { kind: 'relay' } | { kind: 'http' } | { kind: 'tab'; rowId: number | null };

const RELAY_SOURCE: RemoteSource = { kind: 'relay' };
let remoteSource: RemoteSource = RELAY_SOURCE;

/**
 * Applies an update from the HTTP routes or from another tab. Its origin is the provider, so y-websocket does not
 * send it on, and the connection's `update` listener, which Yjs runs synchronously inside the apply, reads its source
 * from `source`.
 */
export function applyRemoteUpdate(conn: YjsConnection, update: Uint8Array, source: Exclude<RemoteSource, { kind: 'relay' }>) {
  remoteSource = source;
  try {
    Y.applyUpdate(conn.yDoc, update, conn.provider);
  } finally {
    remoteSource = RELAY_SOURCE;
  }
}

/**
 * Ends a connection for good: no reconnect over either transport, and its editor turns read-only (useYjsConnection
 * reports `stopped`), so nothing typed after this is lost unsynced. `reason`, if any, names why, in a toast too.
 */
function stopConnection(editSessionId: string, conn: YjsConnection, reason: YjsStopReason | null) {
  if (conn.stopped) return;
  conn.stopped = true;
  conn.provider.disconnect();
  pauseTransports(editSessionId, conn);
  useYjsSyncStore.setState((s) => ({
    stopped: { ...s.stopped, [editSessionId]: true },
    stopReason: reason ? { ...s.stopReason, [editSessionId]: reason } : s.stopReason,
  }));
  if (reason) toaster.warning(i18n.t(STOP_MESSAGES[reason]));
}

/**
 * Ends the connection of a deleted entity for good. Its document went with the entity, so nothing can save the edits it
 * holds: they are discarded, and the toast says so only when there were some. useYjsConnection reports `deleted`.
 */
function endDeleted(editSessionId: string, conn: YjsConnection) {
  const { unsynced } = conn;
  setUnsynced(editSessionId, conn, false);
  useYjsSyncStore.setState((s) => ({ deleted: { ...s.deleted, [editSessionId]: true } }));
  stopConnection(editSessionId, conn, null);
  reapConnection(editSessionId, conn);
  if (unsynced) toaster.warning(i18n.t('error:sync_deleted.text'));
}

/**
 * Ends a connection on the HTTP routes' final answer, as the relay's matching close ends it: another generation
 * rebuilds it, a deleted entity ends it as deleted, and lost rights or a refused update stop it. Edits no server holds
 * are parked first.
 */
function endOverHttp(
  editSessionId: string,
  conn: YjsConnection,
  reason: UnsaveableReason,
  entityType: ProductEntityType,
  tenantId: string,
  organizationId: string,
) {
  if (reason === 'replaced') return rebuildConnection(editSessionId, conn, entityType, tenantId, organizationId);
  if (conn.unsynced) conn.writer?.park(reason, conn.yDoc).catch((error) => console.error('[yjs] Parking unsaveable edits failed', error));
  if (reason === 'deleted') return endDeleted(editSessionId, conn);
  stopConnection(editSessionId, conn, reason);
}

/** What a connection holds per document: a rebuild replaces all of it. */
type DocParts = Pick<
  YjsConnection,
  'yDoc' | 'awareness' | 'provider' | 'fragment' | 'ledger' | 'transport' | 'loaded' | 'ready' | 'stored' | 'writer' | 'http' | 'applied'
>;

/**
 * A fresh document, its Awareness and its provider for the entity's session, with the token held for it. The provider
 * waits for startConnection to connect.
 */
function openDoc(editSessionId: string, entityType: ProductEntityType, tenantId: string): DocParts {
  const serverUrl = toWsUrl(appConfig.yjsUrl!);
  // The session is the entity's document, and a token opens that one document only.
  const token = useUserStore.getState().yjsTokens[yjsTokenKey(entityType, editSessionId)];
  if (!token) throw new Error(`[yjs] No token available for ${entityType}:${editSessionId}`);

  const yDoc = new Y.Doc();
  const awareness = new Awareness(yDoc);
  const ledger: SocketLedger = {
    sent: 0,
    saved: 0,
    handshakeAt: 0,
    legacy: false,
    generationSeen: false,
    handshakeProven: false,
    onChange: () => {},
    onHandshakeSent: () => {},
  };
  const provider = new WebsocketProvider(serverUrl, editSessionId, yDoc, {
    params: { token, entityType, tenantId },
    awareness,
    // y-websocket's own tab channel exchanges whole documents with no generation, so a tab that rebuilt on a reseeded
    // document and one that has not would merge two histories. The app's tab channel carries the generation.
    disableBc: true,
    connect: false,
    maxBackoffTime: MAX_BACKOFF_MS,
    WebSocketPolyfill: ledgerSocket(ledger),
  });
  return {
    yDoc,
    awareness,
    provider,
    fragment: yDoc.getXmlFragment('document-store'),
    ledger,
    transport: 'none',
    loaded: false,
    ready: false,
    stored: false,
    writer: null,
    http: null,
    applied: { upTo: 0, ids: new Set() },
  };
}

/** Connects a new document's provider while online, once the document is loaded, so its handshake Step1 carries the stored state. */
function startConnection(conn: YjsConnection) {
  // Nothing is stored yet, so there is nothing to load first.
  conn.loaded = true;
  if (onlineManager.isOnline() !== false) conn.provider.connect();
}

/**
 * Listens on the connection's document and provider: keeps the token current, ends the connection for good on a
 * final close or a deleted entity, rebuilds it when the relay reseeded the document, reports the first sync, and tracks
 * the edits the relay has not saved yet.
 */
function bindProvider(editSessionId: string, conn: YjsConnection, entityType: ProductEntityType, tenantId: string, organizationId: string) {
  const { provider, yDoc, ledger } = conn;
  const tokenKey = yjsTokenKey(entityType, editSessionId);
  const tokenQueryKey = yjsTokenKeys.entity(entityType, editSessionId);

  // Clears `unsynced` once the server holds every edit, then lets a connection whose grace period ran out meanwhile go.
  const settle = () => {
    if (conn.provider !== provider || !conn.unsynced || !isClean(conn)) return;
    setUnsynced(editSessionId, conn, false);
    reapConnection(editSessionId, conn);
  };
  ledger.onChange = settle;

  // A withdrawn token stays withdrawn across an offline blip: reconnect only while one is held.
  conn.unsubOnline = onlineManager.subscribe((isOnline) => {
    if (!isOnline) {
      provider.disconnect();
      pauseTransports(editSessionId, conn);
    } else if (!conn.stopped && useUserStore.getState().yjsTokens[tokenKey]) provider.connect();
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
      // A 404 withdrew it: the entity was deleted, which ends the connection as the relay's 4410 does.
      if (state.user && yjsTokenRefusal(queryClient.getQueryState(tokenQueryKey)?.error) === 'deleted') return endDeleted(editSessionId, conn);
      // Signed out: unsaved edits go with the session, as the user's local database does, and no later user sees them.
      // TODO(offline): decide again whether sign-out discards unsaved edits, or asks first while some are unsaved, once documents are stored offline.
      if (!state.user) setUnsynced(editSessionId, conn, false);
      stopConnection(editSessionId, conn, state.user ? 'denied' : null);
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
      void queryClient.invalidateQueries({ queryKey: tokenQueryKey });
      // An open editor's token query refetches on the invalidation. A connection kept only for unsaved edits has none
      // observing the key, so it fetches its own token, and a refusal withdraws it like the query's would.
      if (!queryClient.getQueryCache().find({ queryKey: tokenQueryKey })?.getObserversCount()) {
        queryClient
          .fetchQuery(yjsTokenQueryOptions({ entityType, entityId: editSessionId, tenantId, organizationId }))
          .then((token) => useUserStore.getState().setYjsToken(tokenKey, token))
          .catch((error) => {
            if (yjsTokenRefusal(error)) useUserStore.getState().setYjsToken(tokenKey, null);
          });
      }
      if (refusedTokens.size < MAX_TOKEN_FAILURES) return;
      console.warn(`[yjs] Circuit breaker: ${refusedTokens.size} tokens refused in a row for ${editSessionId}`);
      stopConnection(editSessionId, conn, 'expired');
      return;
    }

    // The entity was deleted, and its document with it: final, and nothing the document holds can be saved.
    if (event.code === YJS_CLOSE.ENTITY_DELETED) return endDeleted(editSessionId, conn);

    const reason = FINAL_CLOSES.get(event.code);
    if (reason) stopConnection(editSessionId, conn, reason);
  });

  // The relay announces the document's generation before it answers a handshake. The first one is the document's. A
  // description written outside the relay (REST, MCP, an import) reaches the document as an ordinary update and keeps
  // the generation. Another one later means the relay reseeded the document, after a delete and a restore or a lost
  // document row, and this document shares no history with the new one: it is dropped here, before y-websocket merges
  // or uploads anything of it. Edits the relay never saved go with it, and the rebuild says so.
  provider.messageHandlers[YJS_MESSAGE.GENERATION] = (_encoder, decoder) => {
    const generation = decoding.readVarString(decoder);
    if (conn.generation === null) conn.generation = generation;
    else if (conn.generation !== generation) return rebuildConnection(editSessionId, conn, entityType, tenantId, organizationId);
    ledger.generationSeen = true;
  };

  // The relay joins a socket to the document's session before it answers the handshake, so peers' updates can arrive
  // ahead of the socket's `Generation`, and a document of another generation would merge them. They are dropped: the
  // handshake's Step2, which follows the `Generation`, carries every update the relay logged before it.
  const readSync = provider.messageHandlers[YJS_MESSAGE.SYNC];
  provider.messageHandlers[YJS_MESSAGE.SYNC] = (...args) => {
    if (ledger.generationSeen) readSync(...args);
  };

  // One per Step2 or Update this socket sent, in order. Any `Saved` proves the relay sends them.
  provider.messageHandlers[YJS_MESSAGE.SAVED] = () => {
    ledger.saved++;
    if (ledger.handshakeAt > 0 && ledger.saved >= ledger.handshakeAt) ledger.handshakeProven = true;
    ledger.legacy = false;
    clearTimeout(ledger.fallbackTimer);
    settle();
  };

  // A local edit stays unsynced until the relay saved it: y-websocket sends it at once while connected, otherwise the
  // next handshake's Step2 carries it. Settled a microtask later, once y-websocket's own listener sent it. An update the
  // relay sent (a write from outside the relay included), an HTTP pull or another tab's edit has the provider as its
  // origin and is no edit of this tab; the store keeps it by its source.
  yDoc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === provider) {
      conn.writer?.append(update, false, remoteSource.kind === 'tab' ? { rowId: remoteSource.rowId } : undefined);
      return;
    }
    conn.writer?.append(update, true);
    // Off the socket, the HTTP link keeps the edit: it posts it, or batches it into its next handshake.
    if (conn.transport !== 'ws') conn.http?.queue(update);
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

  // HTTP takes over when a socket attempt has not synced within WS_SYNC_DEADLINE_MS while the API answers. y-websocket
  // keeps reconnecting with backoff meanwhile, and the first sync hands the document back. No switch disconnects it.
  conn.http = createHttpLink(
    conn,
    { entityType, entityId: editSessionId, tenantId, organizationId },
    { onChange: settle, end: (reason) => endOverHttp(editSessionId, conn, reason, entityType, tenantId, organizationId) },
  );
  const enterHttp = async () => {
    const link = conn.http;
    if (!link || !(await link.enter()) || conn.http !== link || conn.stopped || provider.synced) return;
    setTransport(editSessionId, conn, 'http');
    setReady(editSessionId, conn);
    // The link may have reported its ledger before the transport was its own.
    settle();
  };
  provider.on('status', ({ status }) => {
    if (status !== 'connecting' || conn.wsDeadline || conn.transport === 'http' || provider.synced) return;
    conn.wsDeadline = setTimeout(() => {
      conn.wsDeadline = undefined;
      if (!conn.stopped && !provider.synced && onlineManager.isOnline() !== false) void enterHttp();
    }, WS_SYNC_DEADLINE_MS);
  });
  provider.on('sync', (isSynced: boolean) => {
    if (!isSynced) return;
    clearTimeout(conn.wsDeadline);
    conn.wsDeadline = undefined;
    // A post in flight settles; the socket's handshake proves the whole document by itself.
    conn.http?.leave();
    setTransport(editSessionId, conn, 'ws');
    setReady(editSessionId, conn);
  });
}

/** Ends the connection's transports, its Awareness and its document. */
function unbindProvider(conn: YjsConnection) {
  conn.unsubOnline?.();
  conn.unsubToken?.();
  conn.stopResyncWatch?.();
  clearTimeout(conn.ledger.fallbackTimer);
  clearTimeout(conn.wsDeadline);
  conn.http?.leave();
  conn.provider.destroy();
  conn.awareness.destroy();
  conn.yDoc.destroy();
}

/**
 * Replaces the connection's document with a fresh one that syncs the reseeded server state, after a delete and a
 * restore or a lost document row. The editor remounts on the new fragment once it synced (useYjsConnection reports
 * `synced` false meanwhile), and the user is told when the dropped document held edits the relay never saved, since the
 * description they see next is the one the relay seeded from the entity row. A connection that only waited for those
 * edits to be saved has nothing left to wait for, and goes.
 */
function rebuildConnection(editSessionId: string, conn: YjsConnection, entityType: ProductEntityType, tenantId: string, organizationId: string) {
  const { unsynced } = conn;
  setUnsynced(editSessionId, conn, false);
  if (conn.refCount === 0 && !conn.graceTimer) destroyConnection(editSessionId, conn);
  else {
    unbindProvider(conn);
    Object.assign(conn, openDoc(editSessionId, entityType, tenantId), { generation: null, wsDeadline: undefined });
    useYjsSyncStore.setState((s) => ({
      synced: { ...s.synced, [editSessionId]: false },
      ready: { ...s.ready, [editSessionId]: false },
      transport: { ...s.transport, [editSessionId]: 'none' },
      rebuilds: { ...s.rebuilds, [editSessionId]: (s.rebuilds[editSessionId] ?? 0) + 1 },
    }));
    bindProvider(editSessionId, conn, entityType, tenantId, organizationId);
    startConnection(conn);
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
  startConnection(conn);
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
    const { [editSessionId]: _stopReason, ...stopReason } = s.stopReason;
    const { [editSessionId]: _ready, ...ready } = s.ready;
    const { [editSessionId]: _transport, ...transport } = s.transport;
    const { [editSessionId]: _rebuilds, ...rebuilds } = s.rebuilds;
    const { [editSessionId]: _unsynced, ...unsynced } = s.unsynced;
    const { [editSessionId]: _deleted, ...deleted } = s.deleted;
    return { synced, stopped, stopReason, ready, transport, rebuilds, unsynced, deleted };
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
 * and after that for as long as it holds edits the server has not saved; `undefined` disables it. `ready` turns true
 * once the editor may mount: synced over the relay's socket or over HTTP, or loaded from storage. `transport` names
 * what carries the edits: `ws`, `http` while the relay is out of reach, or `none` before the first sync and while
 * offline. `stopped` turns true once the session ended for good, with `stopReason` saying why when a final answer did:
 * the editor must go read-only. `deleted` turns true with it when the entity was deleted. `ready` and `synced` drop
 * back to false while a reseeded document syncs afresh, and `rebuilds` counts those, so the editor remounts on the new
 * fragment. `unsynced` is true while the document holds local edits the server has not saved.
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
  const ready = useYjsSyncStore((s) => s.ready[editSessionId ?? ''] ?? false);
  const transport = useYjsSyncStore((s) => s.transport[editSessionId ?? ''] ?? 'none');
  const stopped = useYjsSyncStore((s) => s.stopped[editSessionId ?? ''] ?? false);
  const stopReason = useYjsSyncStore((s) => s.stopReason[editSessionId ?? ''] ?? null);
  const rebuilds = useYjsSyncStore((s) => s.rebuilds[editSessionId ?? ''] ?? 0);
  const unsynced = useYjsSyncStore((s) => s.unsynced[editSessionId ?? ''] ?? false);
  const deleted = useYjsSyncStore((s) => s.deleted[editSessionId ?? ''] ?? false);

  if (!conn) return null;
  return { awareness: conn.awareness, fragment: conn.fragment, ready, transport, synced, stopped, stopReason, rebuilds, unsynced, deleted };
}
