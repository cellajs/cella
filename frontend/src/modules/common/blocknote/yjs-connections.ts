import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import * as decoding from 'lib0/decoding';
import { useEffect, useState } from 'react';
import { appConfig } from 'shared';
import { toWsUrl } from 'shared/utils/ws-url';
import { Awareness } from 'y-protocols/awareness';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { create } from 'zustand';
import type { TKey } from '~/lib/i18n-locales';
import { yjsTokenKeys, yjsTokenQueryOptions, yjsTokenRefusal } from '~/modules/common/blocknote/query';
import { parkUnsaveable } from '~/modules/common/blocknote/unsaveable-notices';
import { yDocFragment } from '~/modules/common/blocknote/ydoc-label';
import { createHttpLink, type HttpLink, wsSyncDeadlineMs } from '~/modules/common/blocknote/yjs-http';
import { watchPendingStructs } from '~/modules/common/blocknote/yjs-resync';
import {
  type AppliedRows,
  createYDocWriter,
  type LoadedYDoc,
  loadYDoc,
  type StoreProof,
  storageOrigin,
  storeLoadTimeoutMs,
  type YDocWriter,
} from '~/modules/common/blocknote/yjs-store';
import { onTabMessage, postTabMessage, type TabMessage, yDocKeyString } from '~/modules/common/blocknote/yjs-tab-channel';
import { toaster } from '~/modules/common/toaster/toaster';
import { userStore, yjsTokenKey } from '~/modules/user/user-store';
import { getLocalUserDb, type UnsaveableReason, type YDocRecord, type YjsDocScope } from '~/query/local-user-db';
import { queryClient } from '~/query/query-client';

const gracePeriodMs = 30_000;
const maxBackoffMs = 30_000;
/** How long a socket waits for its first `Saved` after its handshake Step2, before it takes the relay for one that sends none. */
const savedFallbackMs = 10_000;
/** Distinct tokens the relay refused, with no synced connection between them, before the connection stops for good. */
const maxTokenFailures = 5;

/** WebSocket close codes sent by the Yjs relay; the 4000-4999 range is reserved for application use. */
const yjsCloseCodes = { TOKEN_INVALID: 4001, ACCESS_DENIED: 4003, BAD_REQUEST: 4400, ENTITY_DELETED: 4410 } as const;

/**
 * Message types on the socket: y-websocket's sync, and the relay's own next to sync and awareness (1). `Generation` is
 * the document's generation, sent before every handshake answer; `Saved` is the relay's empty answer, to the sender
 * alone, to each sync Step2 or Update it handled. Must match the relay's `yjsMessageTypes` (yjs/src/constants.ts).
 */
const yjsMessageTypes = { SYNC: 0, GENERATION: 4, SAVED: 5 } as const;
/** The sync subtypes the relay answers with `Saved`. */
const yjsSyncSubtypes = { STEP2: 1, UPDATE: 2 } as const;

/** Why a connection ends for good: every reason its edits can never be saved except a reseed, which rebuilds the connection. */
export type EndReason = Exclude<UnsaveableReason, 'replaced'>;

/**
 * Why a connection stopped for good: edit rights withdrawn (`denied`), a document or update the relay or the HTTP
 * routes refuse (`refused`), or tokens the relay kept refusing (`expired`).
 */
export type YjsStopReason = 'denied' | 'refused' | 'expired';

const stopMessages: Record<YjsStopReason, TKey> = {
  denied: 'error:no_permission_for_sync.text',
  refused: 'error:sync_failed.text',
  expired: 'error:sync_token_expired.text',
};

/**
 * Closes after which no reconnect can succeed, by reason; 1009 is a frame too big for the relay, which a reconnect would
 * send again. Every other close is transient: y-websocket backs off, reconnects with the current token and resyncs.
 */
const finalCloses: ReadonlyMap<number, EndReason> = new Map<number, EndReason>([
  [yjsCloseCodes.ENTITY_DELETED, 'deleted'],
  [yjsCloseCodes.ACCESS_DENIED, 'denied'],
  [yjsCloseCodes.BAD_REQUEST, 'refused'],
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
  /** No `Saved` came within savedFallbackMs of the handshake Step2: a relay that sends none, so y-websocket's `synced` stands in. */
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

const freshLedger: Omit<SocketLedger, 'onChange' | 'onHandshakeSent'> = {
  sent: 0,
  saved: 0,
  handshakeAt: 0,
  legacy: false,
  generationSeen: false,
  handshakeProven: false,
  fallbackTimer: undefined,
};

/** The transport syncing a connection's document: the relay's socket, the API's HTTP routes, or none yet. */
export type YjsTransport = 'none' | 'ws' | 'http';

/** One entity's collaborative document and everything that syncs, stores and shows it. */
export interface YjsConnection {
  scope: YjsDocScope;
  yDoc: Y.Doc;
  /** Cursors and presence: the connection owns it and hands it to the provider, so it lives as long as the document over either transport. */
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
  /** True once the connection ended for good: it never reconnects, and outlives its last editor only while it holds unsaved edits. */
  stopped: boolean;
  /** The document's generation: its stored record's, or the first the relay or the HTTP routes announced; another one later is a reseed. */
  generation: string | null;
  /** True from a local edit until the server saved every edit; the connection outlives its grace period, and an end parks the edits. */
  unsynced: boolean;
  graceTimer?: ReturnType<typeof setTimeout>;
  unsubscribeOnline?: () => void;
  unsubscribeToken?: () => void;
  /** Stops the parked-structs watch that resyncs a document stuck on a lost update. */
  stopResyncWatch?: () => void;
}

/** Each entity's connection, by its id; changed outside React render only. */
const connections = new Map<string, YjsConnection>();

/** What useYjsConnection reports of one connection. */
interface SessionSync {
  /** True once the editor may mount: synced, or loaded from storage; false again while a reseeded document syncs afresh. */
  ready: boolean;
  /** `none` before the first sync and while offline. */
  transport: YjsTransport;
  /** True once the session ended for good: the editor must go read-only. */
  stopped: boolean;
  /** Why it stopped, when a final answer said so. */
  stopReason: YjsStopReason | null;
  /** How often a reseed rebuilt the document; the editor remounts on each new fragment. */
  rebuilds: number;
  /** True while the document holds local edits the server has not saved. */
  unsynced: boolean;
  /** True once the entity was deleted: the connection stopped with it, and the edits its document held were parked. */
  deleted: boolean;
  /** True once storing the document failed for good: its edits live only in this tab until saved. */
  storageFailed: boolean;
}

const initialSession: SessionSync = {
  ready: false,
  transport: 'none',
  stopped: false,
  stopReason: null,
  rebuilds: 0,
  unsynced: false,
  deleted: false,
  storageFailed: false,
};

/** Each connection's session, by its entity id. */
const useYjsSyncStore = create<{ sessions: Record<string, SessionSync> }>(() => ({ sessions: {} }));

const sessionOf = (conn: YjsConnection) => useYjsSyncStore.getState().sessions[conn.scope.entityId] ?? initialSession;

function patchSession(conn: YjsConnection, patch: Partial<SessionSync>) {
  const { entityId } = conn.scope;
  // A destroyed connection's writer still reports its last flush, which must not reach the document's next session.
  if (connections.get(entityId) !== conn) return;
  useYjsSyncStore.setState(({ sessions }) => ({ sessions: { ...sessions, [entityId]: { ...(sessions[entityId] ?? initialSession), ...patch } } }));
}

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (appConfig.mode === 'development') return console.info('[yjs] Beforeunload warning is triggered but not shown in dev mode.');
  event.preventDefault();
}

let unloadGuarded = false;

/**
 * True while a connection holds edits no server saved that only this tab keeps: no writer (no database, or not stored),
 * a failed one, or edits waiting for their commit. Stored edits survive the tab, and the next load resumes them.
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

function setUnsynced(conn: YjsConnection, unsynced: boolean) {
  if (conn.unsynced === unsynced) return;
  conn.unsynced = unsynced;
  patchSession(conn, { unsynced });
  guardUnload();
}

/** Lets the connection's editor mount, until a rebuild opens a fresh document. */
function setReady(conn: YjsConnection) {
  if (conn.ready) return;
  conn.ready = true;
  patchSession(conn, { ready: true });
}

function setTransport(conn: YjsConnection, transport: YjsTransport) {
  if (conn.transport === transport) return;
  conn.transport = transport;
  patchSession(conn, { transport });
}

/** Offline, or stopped: no transport carries an edit, so the deadline goes and HTTP leaves. Back online, the provider's next attempt rearms it. */
function pauseTransports(conn: YjsConnection) {
  clearTimeout(conn.wsDeadline);
  conn.wsDeadline = undefined;
  conn.http?.leave();
  setTransport(conn, 'none');
}

function armSavedFallback(ledger: SocketLedger) {
  if (ledger.saved > 0) return;
  ledger.fallbackTimer = setTimeout(() => {
    ledger.legacy = true;
    ledger.onChange();
  }, savedFallbackMs);
}

/** The sync subtype of a frame y-websocket sends; null for any other message. */
function syncSubtype(data: unknown): number | null {
  if (!(data instanceof Uint8Array) || data.length < 2) return null;
  const decoder = decoding.createDecoder(data);
  if (decoding.readVarUint(decoder) !== yjsMessageTypes.SYNC) return null;
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
      Object.assign(ledger, freshLedger);
    }

    send(data: Parameters<WebSocket['send']>[0]) {
      super.send(data);
      const subtype = syncSubtype(data);
      if (subtype !== yjsSyncSubtypes.STEP2 && subtype !== yjsSyncSubtypes.UPDATE) return;
      ledger.sent++;
      if (subtype === yjsSyncSubtypes.STEP2 && ledger.handshakeAt === 0) {
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

/** What a handshake proves once the server holds it: every stored row the document holds now, and its state. */
export const handshakeProof = (conn: YjsConnection): StoreProof => ({
  kind: 'handshake',
  applied: { upTo: conn.applied.upTo, ids: new Set(conn.applied.ids) },
  vector: Y.encodeStateVector(conn.yDoc),
});

/** Where an update applied with the provider as origin came from: the relay, unless {@link applyRemoteUpdate} says otherwise. */
export type RemoteSource = { kind: 'relay' } | { kind: 'http' } | { kind: 'tab'; rowId: number | null };

const relaySource: RemoteSource = { kind: 'relay' };
let remoteSource: RemoteSource = relaySource;

/**
 * Applies an update from the HTTP routes or another tab with the provider as origin, so y-websocket does not send it on.
 * The `update` listener, which Yjs runs inside the apply, reads `source` from `remoteSource`.
 */
export function applyRemoteUpdate(conn: YjsConnection, update: Uint8Array, source: Exclude<RemoteSource, { kind: 'relay' }>) {
  remoteSource = source;
  try {
    Y.applyUpdate(conn.yDoc, update, conn.provider);
  } finally {
    remoteSource = relaySource;
  }
}

/**
 * Ends a connection for good: no transport reconnects, and the editor turns read-only (`stopped`), so nothing typed
 * after this is lost. `reason` shows in a toast unless `toast` is false, when a parked notice names it.
 */
function stopConnection(conn: YjsConnection, reason: YjsStopReason | null, toast = true) {
  if (conn.stopped) return;
  conn.stopped = true;
  conn.provider.disconnect();
  pauseTransports(conn);
  patchSession(conn, { stopped: true, stopReason: reason });
  if (reason && toast) toaster.warning(i18n.t(stopMessages[reason]));
}

/**
 * Ends a connection for good when nothing can save the edits its document holds: they are parked, and a notice offers
 * them to copy in place of the stop's toast. A clean document's stored copy goes.
 */
function endUnsaveable(conn: YjsConnection, reason: EndReason) {
  const { unsynced } = conn;
  parkUnsaveable(conn, conn.scope, reason);
  setUnsynced(conn, false);
  if (reason === 'deleted') patchSession(conn, { deleted: true });
  stopConnection(conn, reason === 'deleted' ? null : reason, !unsynced);
  reapConnection(conn);
}

/** The HTTP routes' final answer, handled as the relay's matching close: another generation rebuilds, any other reason ends it for good. */
function endOverHttp(conn: YjsConnection, reason: UnsaveableReason) {
  if (reason === 'replaced') return rebuildConnection(conn);
  endUnsaveable(conn, reason);
}

/** What a connection holds per document: a rebuild replaces all of it. */
type DocParts = Pick<
  YjsConnection,
  'yDoc' | 'awareness' | 'provider' | 'fragment' | 'ledger' | 'transport' | 'loaded' | 'ready' | 'stored' | 'writer' | 'http' | 'applied'
>;

/**
 * A fresh document, its Awareness and its provider, with the entity's token if one is held. The provider connects only
 * through startConnection, and without a token waits for one: a stored document is editable meanwhile.
 */
function openDoc({ entityType, entityId, tenantId }: YjsDocScope): DocParts {
  const serverUrl = toWsUrl(appConfig.yjsUrl!);
  const token = userStore.getState().yjsTokens[yjsTokenKey(entityType, entityId)] ?? '';

  const yDoc = new Y.Doc();
  const awareness = new Awareness(yDoc);
  const ledger: SocketLedger = { ...freshLedger, onChange: () => {}, onHandshakeSent: () => {} };
  const provider = new WebsocketProvider(serverUrl, entityId, yDoc, {
    params: { token, entityType, tenantId },
    awareness,
    // y-websocket's tab channel carries no generation, so tabs on two generations would merge two histories; the app's own carries it.
    disableBc: true,
    connect: false,
    maxBackoffTime: maxBackoffMs,
    WebSocketPolyfill: ledgerSocket(ledger),
  });
  return {
    yDoc,
    awareness,
    provider,
    fragment: yDoc.getXmlFragment(yDocFragment),
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

function startConnection(conn: YjsConnection) {
  conn.loaded = true;
  if (onlineManager.isOnline() && conn.provider.params.token) conn.provider.connect();
}

/**
 * Applies the stored document, if any, then connects: the handshake Step1 then carries the stored state. A load slower
 * than storeLoadTimeoutMs connects without it, and is applied when it arrives (applyStored).
 */
function loadConnection(conn: YjsConnection) {
  if (!getLocalUserDb()) return startConnection(conn);
  const { provider, scope } = conn;
  const current = () => connections.get(scope.entityId) === conn && conn.provider === provider;
  const timer = setTimeout(() => {
    if (current() && !conn.loaded) startConnection(conn);
  }, storeLoadTimeoutMs);
  void loadYDoc(scope)
    .catch((error) => {
      console.warn(`[yjs] Stored document not loaded for ${scope.entityId}`, error);
      return null;
    })
    .then((stored) => {
      clearTimeout(timer);
      if (!current()) return;
      const late = conn.loaded;
      if (stored) applyStored(conn, stored);
      if (!late) startConnection(conn);
    });
}

/** Parks or drops a stored document by its record alone, with no writer started; the empty document is the notice's fallback only. */
function parkStoredRecord(scope: YjsDocScope, record: YDocRecord, reason: UnsaveableReason) {
  const yDoc = new Y.Doc();
  parkUnsaveable({ yDoc, writer: createYDocWriter(scope), unsynced: record.unsynced === 1, generation: record.generation }, scope, reason);
  yDoc.destroy();
}

/**
 * Applies a stored document, whose generation becomes the connection's: the relay's `Generation` then matches it or
 * rebuilds. A load that arrives after the relay announced another generation holds another history: its unsynced edits
 * are parked, a clean copy deleted. Otherwise the stored edits merge in, and y-websocket sends them once connected.
 */
function applyStored(conn: YjsConnection, stored: LoadedYDoc) {
  const { record } = stored;
  if (conn.generation !== null && conn.generation !== record.generation) return parkStoredRecord(conn.scope, record, 'replaced');
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
  setReady(conn);
  // Its rows are stored already, so the writer starts without a local row of the whole document.
  startStoring(conn, false);
  if (record.unsynced) setUnsynced(conn, true);
  // Loaded after the HTTP link's handshake, which posted what the document held then: the stored edits go as an edit.
  if (record.unsynced && conn.transport === 'http') conn.http?.queue(Y.mergeUpdates(stored.updates));
  postTabMessage({ kind: 'hello', key: yDocKeyString(conn.scope), generation: record.generation, vector: Y.encodeStateVector(conn.yDoc) });
}

/** Keeps the document in the per-user database from now on: opened for editing, by a focus or a local edit. */
function markStored(conn: YjsConnection) {
  if (conn.stored || conn.stopped) return;
  conn.stored = true;
  startStoring(conn, conn.unsynced);
}

/**
 * Starts the writer of a document marked stored once its generation is known and it synced, or was loaded: storing
 * before the handshake answered would keep an empty document. `unsynced` adds a local row of the whole document, for
 * edits made before.
 */
function startStoring(conn: YjsConnection, unsynced: boolean) {
  if (!conn.stored || conn.writer || conn.generation === null || conn.stopped) return;
  if (!conn.ready && !conn.provider.synced) return;
  const writer = createYDocWriter(conn.scope, { applied: conn.applied, onChange: () => handleWriterChange(conn, writer) });
  if (!writer) return;
  conn.writer = writer;
  writer.start(conn.yDoc, conn.generation, unsynced);
}

/**
 * A writer committed, queued or failed: the unload guard follows, a failure shows, and a connection that is clean
 * proves the rows this commit wrote, which a Saved that came first left local.
 */
function handleWriterChange(conn: YjsConnection, writer: YDocWriter | null) {
  if (!writer || conn.writer !== writer) return;
  if (writer.failed !== sessionOf(conn).storageFailed) patchSession(conn, { storageFailed: writer.failed });
  guardUnload();
  if (!conn.unsynced && !writer.pending && isClean(conn)) void writer.prove({ kind: 'clean' });
}

/** The connection this tab holds for a document, by its key on the tab channel. */
export function findConnection(key: string): YjsConnection | undefined {
  const conn = connections.get(key.slice(key.indexOf(':') + 1));
  return conn && yDocKeyString(conn.scope) === key ? conn : undefined;
}

/** True for an update that carries something: an empty Yjs update is two zero bytes. */
const holdsChanges = (update: Uint8Array) => update.byteLength > 2;

/**
 * Another tab's message, applied only to a connection of the same document and generation: a tab that rebuilt and one
 * that has not hold two histories. An update is no edit of this tab: neither sent on nor stored again when its tab stored it.
 */
function receiveTabMessage(message: TabMessage) {
  const conn = findConnection(message.key);
  if (!conn || conn.stopped || conn.generation !== message.generation) return;
  if (message.kind === 'hello') {
    const missing = Y.encodeStateAsUpdate(conn.yDoc, message.vector);
    if (holdsChanges(missing)) postTabMessage({ kind: 'update', key: message.key, generation: message.generation, update: missing, rowId: null });
    return;
  }
  if (message.rowId !== null) conn.applied.ids.add(message.rowId);
  applyRemoteUpdate(conn, message.update, { kind: 'tab', rowId: message.rowId });
}

onTabMessage(receiveTabMessage);

/** Listens on the connection's document and provider: the token, the first sync, final closes, reseeds, saves, local edits and HTTP. */
function bindProvider(conn: YjsConnection) {
  const { provider, yDoc, ledger, scope } = conn;
  const tokenKey = yjsTokenKey(scope.entityType, scope.entityId);
  const tokenQueryKey = yjsTokenKeys.entity(scope.entityType, scope.entityId);

  // Once the server holds every edit, `unsynced` clears, the stored rows are proven, and a connection past its grace period goes.
  const settle = () => {
    if (conn.provider !== provider || !conn.unsynced || !isClean(conn)) return;
    setUnsynced(conn, false);
    void conn.writer?.prove({ kind: 'clean' });
    reapConnection(conn);
  };
  ledger.onChange = settle;

  // What the handshake's Step2 proves once the relay saved it; null for a document not stored yet, which has no rows to prove.
  let handshake: StoreProof | null = null;
  ledger.onHandshakeSent = () => {
    handshake = conn.writer ? handshakeProof(conn) : null;
  };

  // A withdrawn token stays withdrawn across an offline blip: reconnect only while one is held.
  conn.unsubscribeOnline = onlineManager.subscribe((isOnline) => {
    if (!isOnline) {
      provider.disconnect();
      pauseTransports(conn);
    } else if (conn.loaded && !conn.stopped && userStore.getState().yjsTokens[tokenKey]) provider.connect();
  });

  // Keep provider params on the latest token so a reconnect (after sleep, or the relay's close at expiry) uses a fresh one.
  conn.unsubscribeToken = userStore.subscribe((state, prev) => {
    const newToken = state.yjsTokens[tokenKey];
    if (newToken) {
      provider.params.token = newToken;
      // A document opened without a token, from storage, connects once one arrives.
      if (!prev.yjsTokens[tokenKey] && conn.loaded && !conn.stopped && onlineManager.isOnline()) provider.connect();
      return;
    }
    // Withdrawn (access revoked, the entity gone, or signed out), also while offline: the token cannot come back.
    if (!prev.yjsTokens[tokenKey]) return;
    // Signed out: storage stays; a hard sign-out lists these edits before it deletes the database, and a lost session keeps them.
    if (!state.user) {
      setUnsynced(conn, false);
      stopConnection(conn, null);
      return reapConnection(conn);
    }
    // The token route refused it: 404 for a deleted entity, as the relay's 4410 says, else 403 for lost edit rights.
    const refusal = yjsTokenRefusal(queryClient.getQueryState(tokenQueryKey)?.error);
    endUnsaveable(conn, refusal ?? 'denied');
  });

  // The token each attempt carries: y-websocket reads the params as it opens a socket, then reports 'connecting'.
  let attemptToken = provider.params.token;
  provider.on('status', ({ status }) => {
    if (status === 'connecting') attemptToken = provider.params.token;
  });

  // Tokens refused since the last sync: the relay closes an unusable token right after the handshake, so an open socket proves nothing.
  const refusedTokens = new Set<string>();
  provider.on('sync', (isSynced: boolean) => {
    if (!isSynced) return;
    refusedTokens.clear();
    startStoring(conn, conn.unsynced);
    settle();
  });

  provider.on('connection-close', (event: CloseEvent | null) => {
    // A local close carries no event; it and every transient close reconnect with backoff.
    if (!event || conn.stopped) return;

    // An expired or invalid token; the refetch this starts reaches the provider params before a later reconnect. Only
    // distinct tokens count: while the API is out of reach, every reconnect carries the same expired token again.
    if (event.code === yjsCloseCodes.TOKEN_INVALID) {
      refusedTokens.add(attemptToken);
      void queryClient.invalidateQueries({ queryKey: tokenQueryKey });
      // A connection kept only for unsaved edits has no query observing the key: it fetches its own, and a refusal withdraws it.
      if (!queryClient.getQueryCache().find({ queryKey: tokenQueryKey })?.getObserversCount()) {
        queryClient
          .query(yjsTokenQueryOptions(scope))
          .then((token) => userStore.getState().setYjsToken(tokenKey, token))
          .catch((error) => {
            if (yjsTokenRefusal(error)) userStore.getState().setYjsToken(tokenKey, null);
          });
      }
      if (refusedTokens.size < maxTokenFailures) return;
      console.warn(`[yjs] Circuit breaker: ${refusedTokens.size} tokens refused in a row for ${scope.entityId}`);
      stopConnection(conn, 'expired');
      return;
    }

    const reason = finalCloses.get(event.code);
    if (reason) endUnsaveable(conn, reason);
  });

  // The relay announces the generation before it answers a handshake; a description written outside the relay (REST,
  // MCP, an import) keeps it. Another one means a reseed (a delete and a restore, or a lost document row), and this
  // document shares no history with the new one: it is dropped here, before y-websocket merges or uploads any of it.
  provider.messageHandlers[yjsMessageTypes.GENERATION] = (_encoder, decoder) => {
    const generation = decoding.readVarString(decoder);
    if (conn.generation === null) conn.generation = generation;
    else if (conn.generation !== generation) return rebuildConnection(conn);
    ledger.generationSeen = true;
  };

  // The relay joins a socket to the session before it answers the handshake, so peers' updates can arrive ahead of the
  // `Generation`, into a document that may be another generation's. They are dropped: the Step2 after it carries them.
  const readSync = provider.messageHandlers[yjsMessageTypes.SYNC];
  provider.messageHandlers[yjsMessageTypes.SYNC] = (...args) => {
    if (ledger.generationSeen) readSync(...args);
  };

  // One per Step2 or Update this socket sent, in order. Any `Saved` proves the relay sends them.
  provider.messageHandlers[yjsMessageTypes.SAVED] = () => {
    ledger.saved++;
    if (ledger.handshakeAt > 0 && ledger.saved >= ledger.handshakeAt && !ledger.handshakeProven) {
      ledger.handshakeProven = true;
      if (handshake) void conn.writer?.prove(handshake);
      handshake = null;
    }
    ledger.legacy = false;
    clearTimeout(ledger.fallbackTimer);
    settle();
  };

  // An update with the provider as origin (the relay, an HTTP pull, another tab) is no edit of this tab. A local edit
  // stays unsynced until the server saved it, and settles a microtask later, once y-websocket's own listener sent it.
  yDoc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === storageOrigin) return;
    if (origin === provider) {
      conn.writer?.append(update, false, remoteSource.kind === 'tab' ? { rowId: remoteSource.rowId } : undefined);
      return;
    }
    // A local edit opens the document for editing, also in an editor never focused (a checklist toggle).
    markStored(conn);
    conn.writer?.append(update, true);
    // Off the socket, the HTTP link keeps the edit: it posts it, or batches it into its next handshake.
    if (conn.transport !== 'ws') conn.http?.queue(update);
    setUnsynced(conn, true);
    queueMicrotask(settle);
  });

  conn.stopResyncWatch = watchPendingStructs(yDoc, provider);

  // HTTP takes over when a socket attempt has not synced within wsSyncDeadlineMs while the API answers. y-websocket
  // keeps reconnecting with backoff meanwhile, and the first sync hands the document back. No switch disconnects it.
  conn.http = createHttpLink(conn, { onChange: settle, onEnd: (reason) => endOverHttp(conn, reason) });
  const enterHttp = async () => {
    const link = conn.http;
    if (!link || !(await link.enter()) || conn.http !== link || conn.stopped || provider.synced) return;
    setTransport(conn, 'http');
    setReady(conn);
    startStoring(conn, conn.unsynced);
    // The link may have reported its ledger before the transport was its own.
    settle();
  };
  provider.on('status', ({ status }) => {
    if (status !== 'connecting' || conn.wsDeadline || conn.transport === 'http' || provider.synced) return;
    conn.wsDeadline = setTimeout(() => {
      conn.wsDeadline = undefined;
      if (!conn.stopped && !provider.synced && onlineManager.isOnline()) void enterHttp();
    }, wsSyncDeadlineMs);
  });
  provider.on('sync', (isSynced: boolean) => {
    if (!isSynced) return;
    clearTimeout(conn.wsDeadline);
    conn.wsDeadline = undefined;
    // A post in flight settles; the socket's handshake proves the whole document by itself.
    conn.http?.leave();
    setTransport(conn, 'ws');
    setReady(conn);
  });
}

/** Ends the connection's transports, its Awareness and its document. */
function unbindProvider(conn: YjsConnection) {
  conn.unsubscribeOnline?.();
  conn.unsubscribeToken?.();
  conn.stopResyncWatch?.();
  clearTimeout(conn.ledger.fallbackTimer);
  clearTimeout(conn.wsDeadline);
  conn.http?.leave();
  conn.provider.destroy();
  conn.awareness.destroy();
  conn.yDoc.destroy();
}

/**
 * Replaces the connection's document with a fresh one that syncs the reseeded server state; the editor remounts on its
 * fragment once it synced (`ready` is false meanwhile). Edits the relay never saved cannot reach it and are parked, and
 * a connection that only waited for them to be saved goes.
 */
function rebuildConnection(conn: YjsConnection) {
  const { stored } = conn;
  parkUnsaveable(conn, conn.scope, 'replaced');
  setUnsynced(conn, false);
  if (conn.refCount === 0 && !conn.graceTimer) destroyConnection(conn);
  else {
    unbindProvider(conn);
    // A stored document stays stored: the fresh one is written whole once it synced, over the dropped generation's.
    Object.assign(conn, openDoc(conn.scope), { generation: null, wsDeadline: undefined, stored });
    patchSession(conn, { ready: false, transport: 'none', rebuilds: sessionOf(conn).rebuilds + 1 });
    bindProvider(conn);
    startConnection(conn);
  }
}

function acquireConnection(scope: YjsDocScope): YjsConnection {
  const existing = connections.get(scope.entityId);

  if (existing) {
    if (existing.graceTimer) {
      clearTimeout(existing.graceTimer);
      existing.graceTimer = undefined;
    }
    existing.refCount++;
    return existing;
  }

  const conn: YjsConnection = { scope, ...openDoc(scope), refCount: 1, stopped: false, generation: null, unsynced: false };
  bindProvider(conn);
  connections.set(scope.entityId, conn);
  loadConnection(conn);
  return conn;
}

function destroyConnection(conn: YjsConnection) {
  const { entityId } = conn.scope;
  if (connections.get(entityId) !== conn) return;
  unbindProvider(conn);
  connections.delete(entityId);
  guardUnload();
  useYjsSyncStore.setState(({ sessions }) => {
    const { [entityId]: _destroyed, ...rest } = sessions;
    return { sessions: rest };
  });
}

/**
 * Destroys a connection no editor holds once its grace period is over, unless it holds unsaved edits: it stays,
 * reconnecting, until the server saved them. A stopped one never does, and keeps them for the reopened editor to show.
 */
function reapConnection(conn: YjsConnection) {
  if (conn.refCount > 0 || conn.graceTimer || conn.unsynced) return;
  destroyConnection(conn);
}

/** Unsynced edits a connection holds in memory only: no database stores them, or storing them failed. */
export interface UnstoredYDoc {
  entityId: string;
  yDoc: Y.Doc;
}

/** The connections with edits no database stores, live, for the sign-out confirm; edits waiting for their commit count as stored. */
export function watchUnstoredYDocs(onChange: (docs: UnstoredYDoc[]) => void): () => void {
  let emitted: string | undefined;
  const emit = () => {
    const docs = [...connections]
      .filter(([, conn]) => conn.unsynced && (!conn.writer || conn.writer.failed))
      .map(([entityId, conn]) => ({ entityId, yDoc: conn.yDoc }));
    const ids = docs.map((doc) => doc.entityId).join();
    if (ids === emitted) return;
    emitted = ids;
    onChange(docs);
  };
  emit();
  return useYjsSyncStore.subscribe(emit);
}

/** How long boot resume waits for a background connection to upload before it opens the next one. */
const resumeWaitMs = 60_000;
/** How often boot resume looks whether a background connection is done. */
const resumePollMs = 1_000;

/**
 * Opens a background connection (no editor holds it) for a stored document with unsynced edits: it fetches its own
 * token, uploads through the handshake and is reaped once clean. Resolves once clean, stopped or gone, or after resumeWaitMs.
 */
export async function resumeConnection(record: YDocRecord): Promise<void> {
  const { entityType, entityId, tenantId, organizationId } = record;
  if (connections.has(entityId)) return;
  const scope: YjsDocScope = { entityType, entityId, tenantId, organizationId };
  const tokenKey = yjsTokenKey(entityType, entityId);
  if (!userStore.getState().yjsTokens[tokenKey]) {
    try {
      const token = await queryClient.query(yjsTokenQueryOptions(scope));
      userStore.getState().setYjsToken(tokenKey, token);
    } catch (error) {
      // Deleted, or edit rights lost while the edits waited: they are parked; a network failure retries once back online.
      const refusal = yjsTokenRefusal(error);
      if (!refusal) return console.warn(`[yjs] No token to resume ${entityType}:${entityId}`, error);
      return parkStoredRecord(scope, record, refusal);
    }
  }
  if (connections.has(entityId)) return;
  const conn = acquireConnection(scope);
  releaseConnection(entityId);

  await new Promise<void>((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const done = connections.get(entityId) !== conn || conn.stopped || (conn.loaded && !conn.unsynced);
      if (!done && Date.now() - started < resumeWaitMs) return;
      clearInterval(timer);
      resolve();
    }, resumePollMs);
  });
}

function releaseConnection(entityId: string) {
  const conn = connections.get(entityId);
  if (!conn) return;

  conn.refCount--;
  if (conn.refCount > 0) return;
  // A stopped connection skips the grace period; only unsaved edits keep it, for the reopened editor (reapConnection).
  if (conn.stopped) return reapConnection(conn);
  conn.graceTimer = setTimeout(() => {
    conn.graceTimer = undefined;
    reapConnection(conn);
  }, gracePeriodMs);
}

/**
 * The entity's ref-counted connection, kept for a grace period after the last consumer unmounts (a remount reuses it)
 * and while it holds unsaved edits; null while `enabled` is false. It reports the {@link SessionSync}.
 */
export function useYjsConnection({ enabled, entityType, entityId, tenantId, organizationId }: YjsDocScope & { enabled: boolean }) {
  const [conn, setConn] = useState<YjsConnection | null>(() => (enabled ? (connections.get(entityId) ?? null) : null));

  useEffect(() => {
    if (!enabled) {
      setConn(null);
      return;
    }
    setConn(acquireConnection({ entityType, entityId, tenantId, organizationId }));
    return () => {
      releaseConnection(entityId);
      setConn(null);
    };
  }, [enabled, entityType, entityId, tenantId, organizationId]);

  const session = useYjsSyncStore((state) => state.sessions[entityId]) ?? initialSession;

  if (!conn) return null;
  return {
    awareness: conn.awareness,
    fragment: conn.fragment,
    ...session,
    /** Opened for editing: the editor calls it on focus, so a warm editor, never focused, stores nothing. */
    markStored: () => markStored(conn),
  };
}
