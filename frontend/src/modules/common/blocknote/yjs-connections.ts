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
import { yjsTokenKeys } from '~/modules/common/blocknote/query';
import { watchPendingStructs } from '~/modules/common/blocknote/yjs-resync';
import { toaster } from '~/modules/common/toaster/toaster';
import { useUserStore, yjsTokenKey } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';

const GRACE_PERIOD_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;

// Distinct tokens the relay refused, with no synced connection between them, before the connection stops for good.
const MAX_TOKEN_FAILURES = 5;

/** WebSocket close codes sent by the Yjs relay; the 4000-4999 range is reserved for application use. */
const YJS_CLOSE = { TOKEN_INVALID: 4001, ACCESS_DENIED: 4003, BAD_REQUEST: 4400 } as const;

/** The relay's own message type next to y-websocket's sync (0) and awareness (1): the document's generation, sent before every handshake answer. Must match yjs/src/sync/relay.ts. */
const YJS_MESSAGE_GENERATION = 4;

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

interface YjsConnection {
  yDoc: Y.Doc;
  provider: WebsocketProvider;
  fragment: Y.XmlFragment;
  refCount: number;
  /** Set once the relay ended the session for good; a stopped connection never reconnects and is not reused. */
  stopped: boolean;
  /** The generation the relay announced for the document at its first handshake; another one later means the document was reseeded. */
  generation: string | null;
  /** True once a local edit was made on the document, so a rebuild can say that unsaved edits were discarded. */
  edited: boolean;
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
}

const useYjsSyncStore = create<YjsSyncState>(() => ({ synced: {}, stopped: {}, rebuilds: {} }));

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
  const provider = new WebsocketProvider(serverUrl, editSessionId, yDoc, {
    params: { token, entityType, tenantId },
    connect: onlineManager.isOnline() !== false,
    maxBackoffTime: MAX_BACKOFF_MS,
  });
  return { yDoc, provider, fragment: yDoc.getXmlFragment('document-store') };
}

/**
 * Listens on the connection's document and provider: keeps the token current, ends the connection for good on a
 * final close, rebuilds it when the relay reseeded the document, and reports the first sync.
 */
function bindProvider(editSessionId: string, conn: YjsConnection, entityType: ProductEntityType, tenantId: string) {
  const { provider, yDoc } = conn;
  const tokenKey = yjsTokenKey(entityType, editSessionId);

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
      stopConnection(editSessionId, conn, state.user ? 'error:no_permission_for_sync.text' : null);
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
    if (isSynced) refusedTokens.clear();
  });

  provider.on('connection-close', (event: CloseEvent | null) => {
    // A local close carries no event; it and every transient close reconnect with backoff.
    if (!event || conn.stopped) return;

    // The relay closes an expired or invalid token with 4001, and the refetch this starts reaches the provider params
    // before a later reconnect. Only distinct tokens count: while the API is unreachable every reconnect carries the
    // expired token again, and that must not end collaboration for good once the API is back.
    if (event.code === YJS_CLOSE.TOKEN_INVALID) {
      refusedTokens.add(attemptToken);
      void queryClient.invalidateQueries({ queryKey: yjsTokenKeys.entity(entityType, editSessionId) });
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
  // shares no history with the new one: it is dropped here, before y-websocket merges or uploads anything of it.
  provider.messageHandlers[YJS_MESSAGE_GENERATION] = (_encoder, decoder) => {
    const generation = decoding.readVarString(decoder);
    if (conn.generation === null) conn.generation = generation;
    else if (conn.generation !== generation) rebuildConnection(editSessionId, conn, entityType, tenantId);
  };

  yDoc.on('update', (_update: Uint8Array, origin: unknown) => {
    if (origin !== provider) conn.edited = true;
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
  conn.provider.destroy();
  conn.yDoc.destroy();
}

/**
 * Replaces the connection's document with a fresh one that syncs the reseeded server state. The editor remounts on
 * the new fragment once it synced (useYjsConnection reports `synced` false meanwhile), and the user is told when the
 * dropped document held edits, since the description they see next is the one written elsewhere.
 */
function rebuildConnection(editSessionId: string, conn: YjsConnection, entityType: ProductEntityType, tenantId: string) {
  const { edited } = conn;
  unbindProvider(conn);
  Object.assign(conn, openDoc(editSessionId, entityType, tenantId), { generation: null, edited: false });
  useYjsSyncStore.setState((s) => ({
    synced: { ...s.synced, [editSessionId]: false },
    rebuilds: { ...s.rebuilds, [editSessionId]: (s.rebuilds[editSessionId] ?? 0) + 1 },
  }));
  bindProvider(editSessionId, conn, entityType, tenantId);
  if (edited) toaster.warning(i18n.t('error:sync_document_replaced.text'));
}

function acquireConnection(editSessionId: string, entityType: ProductEntityType, tenantId: string): YjsConnection {
  const existing = connections.get(editSessionId);

  if (existing) {
    if (existing.graceTimer) {
      clearTimeout(existing.graceTimer);
      existing.graceTimer = undefined;
    }
    existing.refCount++;
    return existing;
  }

  const conn: YjsConnection = { ...openDoc(editSessionId, entityType, tenantId), refCount: 1, stopped: false, generation: null, edited: false };
  bindProvider(editSessionId, conn, entityType, tenantId);
  connections.set(editSessionId, conn);
  return conn;
}

function destroyConnection(editSessionId: string, conn: YjsConnection) {
  unbindProvider(conn);
  connections.delete(editSessionId);
  useYjsSyncStore.setState((s) => {
    const { [editSessionId]: _synced, ...synced } = s.synced;
    const { [editSessionId]: _stopped, ...stopped } = s.stopped;
    const { [editSessionId]: _rebuilds, ...rebuilds } = s.rebuilds;
    return { synced, stopped, rebuilds };
  });
}

function releaseConnection(editSessionId: string) {
  const conn = connections.get(editSessionId);
  if (!conn) return;

  conn.refCount--;
  if (conn.refCount > 0) return;
  // A stopped connection holds nothing to reuse: reopening the editor starts a fresh one.
  if (conn.stopped) {
    destroyConnection(editSessionId, conn);
    return;
  }
  conn.graceTimer = setTimeout(() => destroyConnection(editSessionId, conn), GRACE_PERIOD_MS);
}

/**
 * Ref-counted Yjs connection kept alive for a grace period after the last consumer unmounts, so a remount reuses it;
 * `undefined` disables it. `stopped` turns true once the relay ended the session for good: the editor must go
 * read-only. `synced` drops back to false while a reseeded document syncs afresh, and `rebuilds` counts those, so the
 * editor remounts on the new fragment.
 */
export function useYjsConnection(editSessionId: string | undefined, entityType: ProductEntityType, tenantId: string) {
  const [conn, setConn] = useState<YjsConnection | null>(() => {
    return editSessionId ? (connections.get(editSessionId) ?? null) : null;
  });

  useEffect(() => {
    if (!editSessionId) {
      setConn(null);
      return;
    }
    const acquired = acquireConnection(editSessionId, entityType, tenantId);
    setConn(acquired);
    return () => {
      releaseConnection(editSessionId);
      setConn(null);
    };
  }, [editSessionId, entityType, tenantId]);

  const synced = useYjsSyncStore((s) => s.synced[editSessionId ?? ''] ?? false);
  const stopped = useYjsSyncStore((s) => s.stopped[editSessionId ?? ''] ?? false);
  const rebuilds = useYjsSyncStore((s) => s.rebuilds[editSessionId ?? ''] ?? 0);

  if (!conn) return null;
  return { provider: conn.provider, fragment: conn.fragment, synced, stopped, rebuilds };
}
