import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import * as decoding from 'lib0/decoding';
import { useCallback, useEffect, useState } from 'react';
import { appConfig, type ProductEntityType } from 'shared';
import { toWsUrl } from 'shared/utils/ws-url';
import { Awareness } from 'y-protocols/awareness';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { create } from 'zustand';
import type { TKey } from '~/lib/i18n-locales';
import { yjsTokenKeys, yjsTokenQueryOptions, yjsTokenRefusal } from '~/modules/common/blocknote/query';
import { parkUnsaveable } from '~/modules/common/blocknote/unsaveable-notices';
import { createHttpLink, type HttpLink, type HttpLinkScope, WS_SYNC_DEADLINE_MS } from '~/modules/common/blocknote/yjs-http';
import { watchPendingStructs } from '~/modules/common/blocknote/yjs-resync';
import {
  type AppliedRows,
  createYDocWriter,
  type LoadedYDoc,
  loadYDoc,
  STORE_LOAD_TIMEOUT_MS,
  storageOrigin,
  type YDocWriter,
} from '~/modules/common/blocknote/yjs-store';
import { onTabMessage, postTabHello, postTabUpdate, type TabMessage, toTabKey } from '~/modules/common/blocknote/yjs-tab-channel';
import { toaster } from '~/modules/common/toaster/toaster';
import { useUserStore, yjsTokenKey } from '~/modules/user/user-store';
import { getLocalUserDb, type UnsaveableReason, type YDocRecord } from '~/query/local-user-db';
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

/** Why a connection ends for good: each reason its edits can never be saved, but a reseed, which rebuilds the connection. */
export type EndReason = Exclude<UnsaveableReason, 'replaced'>;

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
 * Closes after which no reconnect can succeed, by why: the entity deleted, access denied, a document or update the
 * relay refuses, and a frame too big for the relay, which a reconnect would send again. Every other close is
 * transient: y-websocket backs off, reconnects with the current token and resyncs, so edits made meanwhile reach it.
 */
const FINAL_CLOSES: ReadonlyMap<number, EndReason> = new Map<number, EndReason>([
  [YJS_CLOSE.ENTITY_DELETED, 'deleted'],
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
   * and holds the page's unload, and a rebuild or an end for good parks them, to copy from a notice.
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
  /** editSessionId → true once storing its document failed for good: its edits live only in this tab until saved */
  storageFailed: Record<string, boolean>;
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
  storageFailed: {},
}));

/** Asks before the page unloads: edits no server saved live only in this tab, and the per-user database does not keep them. */
function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (appConfig.mode === 'development') return console.info('[yjs] Beforeunload warning is triggered but not shown in dev mode.');
  event.preventDefault();
}

let unloadGuarded = false;

/**
 * True while a connection holds edits no server saved that only this tab keeps: nothing stores the document (no
 * database, or not stored), storing failed, or the edits wait for their commit. Stored edits survive the tab, and the
 * next load resumes them.
 */
const holdsUnstoredEdits = (conn: YjsConnection) => conn.unsynced && (!conn.writer || conn.writer.failed || conn.writer.pending);

/** Registers the unload warning while some connection holds unsynced edits nothing stores, and only then. */
function guardUnload() {
  const needed = [...connections.values()].some(holdsUnstoredEdits);
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
 * reports `stopped`), so nothing typed after this is lost unsynced. `reason`, if any, names why, in a toast too unless
 * `toast` is false: a parked notice names it then.
 */
function stopConnection(editSessionId: string, conn: YjsConnection, reason: YjsStopReason | null, toast = true) {
  if (conn.stopped) return;
  conn.stopped = true;
  conn.provider.disconnect();
  pauseTransports(editSessionId, conn);
  useYjsSyncStore.setState((s) => ({
    stopped: { ...s.stopped, [editSessionId]: true },
    stopReason: reason ? { ...s.stopReason, [editSessionId]: reason } : s.stopReason,
  }));
  if (reason && toast) toaster.warning(i18n.t(STOP_MESSAGES[reason]));
}

/**
 * Ends a connection for good when nothing can save the edits its document holds: they are parked, and a notice offers
 * them to copy in place of the stop's toast. A clean document's stored copy goes. useYjsConnection reports `deleted`
 * for a deleted entity.
 */
function endUnsaveable(editSessionId: string, conn: YjsConnection, scope: HttpLinkScope, reason: EndReason) {
  const { unsynced } = conn;
  parkUnsaveable(conn, scope, reason);
  setUnsynced(editSessionId, conn, false);
  if (reason === 'deleted') useYjsSyncStore.setState((s) => ({ deleted: { ...s.deleted, [editSessionId]: true } }));
  stopConnection(editSessionId, conn, reason === 'deleted' ? null : reason, !unsynced);
  reapConnection(editSessionId, conn);
}

/**
 * Ends a connection on the HTTP routes' final answer, as the relay's matching close ends it: another generation
 * rebuilds it, and a deleted entity, lost rights or a refused update end it for good. Both park edits no server holds.
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
  endUnsaveable(editSessionId, conn, { entityType, entityId: editSessionId, tenantId, organizationId }, reason);
}

/** What a connection holds per document: a rebuild replaces all of it. */
type DocParts = Pick<
  YjsConnection,
  'yDoc' | 'awareness' | 'provider' | 'fragment' | 'ledger' | 'transport' | 'loaded' | 'ready' | 'stored' | 'writer' | 'http' | 'applied'
>;

/**
 * A fresh document, its Awareness and its provider for the entity's session, with the token held for it, if any. The
 * provider waits for startConnection to connect, and without a token for the token: a stored document is editable
 * meanwhile.
 */
function openDoc(editSessionId: string, entityType: ProductEntityType, tenantId: string): DocParts {
  const serverUrl = toWsUrl(appConfig.yjsUrl!);
  // The session is the entity's document, and a token opens that one document only.
  const token = useUserStore.getState().yjsTokens[yjsTokenKey(entityType, editSessionId)] ?? '';

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

/** Connects a new document's provider while online and a token is held, once the document is loaded, so its handshake Step1 carries the stored state. */
function startConnection(conn: YjsConnection) {
  conn.loaded = true;
  if (onlineManager.isOnline() !== false && conn.provider.params.token) conn.provider.connect();
}

/** The entity a connection's document belongs to, and the scope it is stored and fetched in. */
interface DocScope {
  entityType: ProductEntityType;
  tenantId: string;
  organizationId: string;
}

/**
 * Applies the stored document, if any, then connects: the handshake Step1 then carries the stored state. A load slower
 * than STORE_LOAD_TIMEOUT_MS connects without it, and is applied when it arrives (applyStored).
 */
function loadConnection(editSessionId: string, conn: YjsConnection, scope: DocScope) {
  if (!getLocalUserDb()) return startConnection(conn);
  const { provider } = conn;
  const current = () => connections.get(editSessionId) === conn && conn.provider === provider;
  const timer = setTimeout(() => {
    if (current() && !conn.loaded) startConnection(conn);
  }, STORE_LOAD_TIMEOUT_MS);
  void loadYDoc({ entityType: scope.entityType, entityId: editSessionId })
    .catch((error) => {
      console.warn(`[yjs] Stored document not loaded for ${editSessionId}`, error);
      return null;
    })
    .then((stored) => {
      clearTimeout(timer);
      if (!current()) return;
      const late = conn.loaded;
      if (stored) applyStored(editSessionId, conn, scope, stored);
      if (!late) startConnection(conn);
    });
}

/**
 * Applies a stored document as `storageOrigin`: no edit of this tab, and nothing to store again. Its generation becomes
 * the connection's, so the relay's `Generation` either matches it or rebuilds. A load that arrived after the relay
 * announced another generation holds another history: its unsynced edits are parked, and a clean copy goes. Otherwise
 * the stored edits merge in; after the connect y-websocket sends them as an update.
 */
function applyStored(editSessionId: string, conn: YjsConnection, scope: DocScope, stored: LoadedYDoc) {
  const { record } = stored;
  const key = { entityType: scope.entityType, entityId: editSessionId };
  if (conn.generation !== null && conn.generation !== record.generation) {
    // Not started, the writer parks or drops by the stored record alone; the empty document is the notice's fallback only.
    const yDoc = new Y.Doc();
    const source = { yDoc, writer: createYDocWriter(key), unsynced: record.unsynced === 1, generation: record.generation };
    parkUnsaveable(source, { ...key, tenantId: scope.tenantId, organizationId: scope.organizationId }, 'replaced');
    yDoc.destroy();
    return;
  }
  Y.transact(
    conn.yDoc,
    () => {
      for (const update of stored.updates) Y.applyUpdate(conn.yDoc, update);
    },
    storageOrigin,
  );
  conn.generation = record.generation;
  conn.applied.upTo = Math.max(conn.applied.upTo, stored.appliedUpTo);
  conn.stored = true;
  setReady(editSessionId, conn);
  // Its rows are stored already, so the writer starts without a local row of the whole document.
  startStoring(editSessionId, conn, scope, false);
  if (record.unsynced) setUnsynced(editSessionId, conn, true);
  // Loaded after the HTTP link's handshake, which posted what the document held then: the stored edits go as an edit.
  if (record.unsynced && conn.transport === 'http') conn.http?.queue(Y.mergeUpdates(stored.updates));
  postTabHello({ t: 'hello', key: toTabKey(key), generation: record.generation, vector: Y.encodeStateVector(conn.yDoc) });
}

/** Keeps the document in the per-user database from now on: opened for editing, by a focus or a local edit. */
function markStored(editSessionId: string, conn: YjsConnection, scope: DocScope) {
  if (conn.stored || conn.stopped) return;
  conn.stored = true;
  startStoring(editSessionId, conn, scope, conn.unsynced);
}

/**
 * Starts the writer of a document marked stored once its generation is known and it synced, or was loaded: storing
 * before the handshake answered would keep an empty document. `unsynced` adds a local row of the whole document, for
 * edits made before.
 */
function startStoring(editSessionId: string, conn: YjsConnection, scope: DocScope, unsynced: boolean) {
  if (!conn.stored || conn.writer || conn.generation === null || conn.stopped) return;
  if (!conn.ready && !conn.provider.synced) return;
  const writer = createYDocWriter(
    { entityType: scope.entityType, entityId: editSessionId },
    { applied: conn.applied, onChange: () => onWriterChange(editSessionId, conn, writer) },
  );
  if (!writer) return;
  conn.writer = writer;
  writer.start(conn.yDoc, { tenantId: scope.tenantId, organizationId: scope.organizationId, generation: conn.generation }, unsynced);
}

/**
 * A writer committed, queued or failed: the unload guard follows, a failure shows, and a connection that is clean
 * proves the rows this commit wrote, which a Saved that came first left local.
 */
function onWriterChange(editSessionId: string, conn: YjsConnection, writer: YDocWriter | null) {
  if (!writer || conn.writer !== writer) return;
  if (writer.failed !== (useYjsSyncStore.getState().storageFailed[editSessionId] ?? false)) {
    useYjsSyncStore.setState((s) => ({ storageFailed: { ...s.storageFailed, [editSessionId]: writer.failed } }));
  }
  guardUnload();
  if (!conn.unsynced && !writer.pending && isClean(conn)) void writer.prove({ kind: 'clean' });
}

/** The connection this tab holds for a document, by its key on the tab channel. */
export function findConnection(key: string): YjsConnection | undefined {
  const separator = key.indexOf(':');
  const conn = connections.get(key.slice(separator + 1));
  return conn?.provider.params.entityType === key.slice(0, separator) ? conn : undefined;
}

/** True for an update that carries something: an empty Yjs update is two zero bytes. */
const holdsChanges = (update: Uint8Array) => update.byteLength > 2;

/**
 * Another tab's message, applied only to a connection of the same document and generation: a tab that rebuilt and one
 * that has not hold two histories. An update is no edit of this tab, and is neither sent nor stored again when its tab
 * stored it. A hello is answered with what the sender's vector lacks.
 */
function receiveTabMessage(msg: TabMessage) {
  const conn = findConnection(msg.key);
  if (!conn || conn.stopped || conn.generation !== msg.generation) return;
  if (msg.t === 'hello') {
    const missing = Y.encodeStateAsUpdate(conn.yDoc, msg.vector);
    if (holdsChanges(missing)) postTabUpdate({ t: 'update', key: msg.key, generation: msg.generation, update: missing, rowId: null });
    return;
  }
  if (msg.rowId !== null) conn.applied.ids.add(msg.rowId);
  applyRemoteUpdate(conn, msg.update, { kind: 'tab', rowId: msg.rowId });
}

onTabMessage(receiveTabMessage);

/**
 * Listens on the connection's document and provider: keeps the token current, ends the connection for good on a
 * final close or a deleted entity, rebuilds it when the relay reseeded the document, reports the first sync, and tracks
 * the edits the relay has not saved yet.
 */
function bindProvider(editSessionId: string, conn: YjsConnection, entityType: ProductEntityType, tenantId: string, organizationId: string) {
  const { provider, yDoc, ledger } = conn;
  const scope: HttpLinkScope = { entityType, entityId: editSessionId, tenantId, organizationId };
  const tokenKey = yjsTokenKey(entityType, editSessionId);
  const tokenQueryKey = yjsTokenKeys.entity(entityType, editSessionId);

  // Clears `unsynced` once the server holds every edit, then lets a connection whose grace period ran out meanwhile go.
  // The stored rows of this tab's edits are proven with it.
  const settle = () => {
    if (conn.provider !== provider || !conn.unsynced || !isClean(conn)) return;
    setUnsynced(editSessionId, conn, false);
    void conn.writer?.prove({ kind: 'clean' });
    reapConnection(editSessionId, conn);
  };
  ledger.onChange = settle;

  // What the handshake's Step2 carries: every stored row the document holds and its state, proven once the relay saved
  // it. A document not stored yet has no rows to prove.
  let handshake: { applied: AppliedRows; vector: Uint8Array } | null = null;
  ledger.onHandshakeSent = () => {
    handshake = conn.writer ? { applied: { upTo: conn.applied.upTo, ids: new Set(conn.applied.ids) }, vector: Y.encodeStateVector(yDoc) } : null;
  };

  // A withdrawn token stays withdrawn across an offline blip: reconnect only while one is held.
  conn.unsubOnline = onlineManager.subscribe((isOnline) => {
    if (!isOnline) {
      provider.disconnect();
      pauseTransports(editSessionId, conn);
    } else if (conn.loaded && !conn.stopped && useUserStore.getState().yjsTokens[tokenKey]) provider.connect();
  });

  // Keep provider params on the latest token so a reconnect (after sleep, or the relay's close at expiry) uses a fresh one.
  conn.unsubToken = useUserStore.subscribe((state, prevState) => {
    const newToken = state.yjsTokens[tokenKey];
    if (newToken) {
      if (provider.params) (provider.params as Record<string, string>).token = newToken;
      // A document opened without a token, from storage, connects once one arrives.
      if (!prevState.yjsTokens[tokenKey] && conn.loaded && !conn.stopped && onlineManager.isOnline() !== false) provider.connect();
      return;
    }
    // Withdrawn (access revoked, the entity gone, or signed out), also while offline: the token cannot come back.
    if (!prevState.yjsTokens[tokenKey]) return;
    // Signed out: the connection goes and leaves storage alone. A hard sign-out deletes the database once the sign-out
    // page listed these edits and the user confirmed; a lost session keeps them stored for the same user's next one.
    if (!state.user) {
      setUnsynced(editSessionId, conn, false);
      stopConnection(editSessionId, conn, null);
      return reapConnection(editSessionId, conn);
    }
    // The token route refused it: 404 for a deleted entity, as the relay's 4410 says, else 403 for lost edit rights.
    const refusal = yjsTokenRefusal(queryClient.getQueryState(tokenQueryKey)?.error);
    endUnsaveable(editSessionId, conn, scope, refusal === 'deleted' ? 'deleted' : 'denied');
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
    startStoring(editSessionId, conn, scope, conn.unsynced);
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

    const reason = FINAL_CLOSES.get(event.code);
    if (reason) endUnsaveable(editSessionId, conn, scope, reason);
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
    if (ledger.handshakeAt > 0 && ledger.saved >= ledger.handshakeAt && !ledger.handshakeProven) {
      ledger.handshakeProven = true;
      if (handshake) void conn.writer?.prove({ kind: 'handshake', ...handshake });
      handshake = null;
    }
    ledger.legacy = false;
    clearTimeout(ledger.fallbackTimer);
    settle();
  };

  // A local edit stays unsynced until the relay saved it: y-websocket sends it at once while connected, otherwise the
  // next handshake's Step2 carries it. Settled a microtask later, once y-websocket's own listener sent it. An update the
  // relay sent (a write from outside the relay included), an HTTP pull or another tab's edit has the provider as its
  // origin and is no edit of this tab; the store keeps it by its source.
  yDoc.on('update', (update: Uint8Array, origin: unknown) => {
    // The stored state as it loaded: stored already, and no edit of this tab.
    if (origin === storageOrigin) return;
    if (origin === provider) {
      conn.writer?.append(update, false, remoteSource.kind === 'tab' ? { rowId: remoteSource.rowId } : undefined);
      return;
    }
    // A local edit opens the document for editing, also in an editor never focused (a checklist toggle).
    markStored(editSessionId, conn, scope);
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
  conn.http = createHttpLink(conn, scope, {
    onChange: settle,
    end: (reason) => endOverHttp(editSessionId, conn, reason, entityType, tenantId, organizationId),
  });
  const enterHttp = async () => {
    const link = conn.http;
    if (!link || !(await link.enter()) || conn.http !== link || conn.stopped || provider.synced) return;
    setTransport(editSessionId, conn, 'http');
    setReady(editSessionId, conn);
    startStoring(editSessionId, conn, scope, conn.unsynced);
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
 * `synced` false meanwhile). Edits the relay never saved cannot reach the reseeded document, so they are parked with
 * a notice to copy them. A connection that only waited for those edits to be saved has nothing left to wait for.
 */
function rebuildConnection(editSessionId: string, conn: YjsConnection, entityType: ProductEntityType, tenantId: string, organizationId: string) {
  const { stored } = conn;
  parkUnsaveable(conn, { entityType, entityId: editSessionId, tenantId, organizationId }, 'replaced');
  setUnsynced(editSessionId, conn, false);
  if (conn.refCount === 0 && !conn.graceTimer) destroyConnection(editSessionId, conn);
  else {
    unbindProvider(conn);
    // A stored document stays stored: the fresh one is written whole once it synced, over the dropped generation's.
    Object.assign(conn, openDoc(editSessionId, entityType, tenantId), { generation: null, wsDeadline: undefined, stored });
    useYjsSyncStore.setState((s) => ({
      synced: { ...s.synced, [editSessionId]: false },
      ready: { ...s.ready, [editSessionId]: false },
      transport: { ...s.transport, [editSessionId]: 'none' },
      rebuilds: { ...s.rebuilds, [editSessionId]: (s.rebuilds[editSessionId] ?? 0) + 1 },
    }));
    bindProvider(editSessionId, conn, entityType, tenantId, organizationId);
    startConnection(conn);
  }
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
  loadConnection(editSessionId, conn, { entityType, tenantId, organizationId });
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
    const { [editSessionId]: _storageFailed, ...storageFailed } = s.storageFailed;
    return { synced, stopped, stopReason, ready, transport, rebuilds, unsynced, deleted, storageFailed };
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

/** Unsynced edits a connection holds in memory only: no database stores them, or storing them failed. */
export interface UnstoredYDoc {
  entityId: string;
  yDoc: Y.Doc;
}

/** Connections holding unsynced edits no database stores, live; the sign-out confirm lists them next to the stored ones. */
export function watchUnstoredYDocs(cb: (docs: UnstoredYDoc[]) => void): () => void {
  let emitted: string | undefined;
  const emit = () => {
    const docs = [...connections]
      .filter(([, conn]) => conn.unsynced && (!conn.writer || conn.writer.failed))
      .map(([entityId, conn]) => ({ entityId, yDoc: conn.yDoc }));
    const ids = docs.map((doc) => doc.entityId).join();
    if (ids === emitted) return;
    emitted = ids;
    cb(docs);
  };
  emit();
  return useYjsSyncStore.subscribe(emit);
}

/** How long boot resume waits for a background connection to upload before it opens the next one. */
const RESUME_WAIT_MS = 60_000;
/** How often boot resume looks whether a background connection is done. */
const RESUME_POLL_MS = 1_000;

/**
 * Opens a background connection (no editor holds it) for a stored document with unsynced edits, so they reach the
 * relay without the author reopening it. It fetches its own token, uploads through the handshake, and is reaped once
 * clean. Resolves once it is clean, stopped or gone, or after RESUME_WAIT_MS, so boot resume opens a few at a time.
 */
export async function resumeConnection(record: YDocRecord): Promise<void> {
  const { entityType, entityId, tenantId, organizationId } = record;
  if (connections.has(entityId)) return;
  const tokenKey = yjsTokenKey(entityType, entityId);
  if (!useUserStore.getState().yjsTokens[tokenKey]) {
    try {
      const token = await queryClient.fetchQuery(yjsTokenQueryOptions({ entityType, entityId, tenantId, organizationId }));
      useUserStore.getState().setYjsToken(tokenKey, token);
    } catch (error) {
      // Deleted, or edit rights lost while the edits waited: they can never be saved, so the stored document is parked
      // with a notice to copy it. A network failure is retried when the browser is back online.
      const refusal = yjsTokenRefusal(error);
      if (!refusal) return console.warn(`[yjs] No token to resume ${entityType}:${entityId}`, error);
      // Not started, the writer parks the stored document alone; the empty document is the notice's fallback only.
      const yDoc = new Y.Doc();
      const scope = { entityType, entityId, tenantId, organizationId };
      parkUnsaveable(
        { yDoc, writer: createYDocWriter(record), unsynced: true, generation: record.generation },
        scope,
        refusal === 'deleted' ? 'deleted' : 'denied',
      );
      yDoc.destroy();
      return;
    }
  }
  if (connections.has(entityId)) return;
  const conn = acquireConnection(entityId, entityType, tenantId, organizationId);
  releaseConnection(entityId);

  await new Promise<void>((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const done = connections.get(entityId) !== conn || conn.stopped || (conn.loaded && !conn.unsynced);
      if (!done && Date.now() - started < RESUME_WAIT_MS) return;
      clearInterval(timer);
      resolve();
    }, RESUME_POLL_MS);
  });
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
 * the editor must go read-only. `deleted` turns true with it when the entity was deleted, and the edits its document
 * held were parked. `ready` and `synced` drop back to false while a reseeded document syncs afresh, and `rebuilds`
 * counts those, so the editor remounts on the new fragment. `unsynced` is true while the document holds local edits the
 * server has not saved. `markStored` keeps the document in the per-user database from
 * then on (the editor calls it on focus; a local edit does too), and `storageFailed` turns true once storing it failed
 * for good.
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
  const storageFailed = useYjsSyncStore((s) => s.storageFailed[editSessionId ?? ''] ?? false);

  // Opened for editing: the editor's focus stores the document from now on. A warm editor is never focused, and stores nothing.
  const storeDocument = useCallback(() => {
    if (conn && editSessionId) markStored(editSessionId, conn, { entityType, tenantId, organizationId });
  }, [conn, editSessionId, entityType, tenantId, organizationId]);

  if (!conn) return null;
  return {
    awareness: conn.awareness,
    fragment: conn.fragment,
    ready,
    transport,
    synced,
    stopped,
    stopReason,
    rebuilds,
    unsynced,
    deleted,
    storageFailed,
    markStored: storeDocument,
  };
}
