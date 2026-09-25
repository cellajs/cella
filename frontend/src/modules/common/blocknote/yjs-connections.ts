import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
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

// Consecutive token refusals, with no synced connection between them, before the connection stops for good.
const MAX_TOKEN_FAILURES = 5;

/** WebSocket close codes sent by the Yjs relay; the 4000-4999 range is reserved for application use. */
const YJS_CLOSE = {
  TOKEN_INVALID: 4001,
  ACCESS_DENIED: 4003,
  BAD_REQUEST: 4400,
  BACKEND_UNAVAILABLE: 4503,
} as const;

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
  graceTimer?: ReturnType<typeof setTimeout>;
  unsubOnline?: () => void;
  unsubToken?: () => void;
  /** Stops the parked-structs watch that resyncs a document stuck on a lost update. */
  stopResyncWatch?: () => void;
}

/** Module-level connection map; mutations happen outside React render. */
const connections = new Map<string, YjsConnection>();

interface YjsSyncState {
  /** editSessionId → synced boolean */
  synced: Record<string, boolean>;
  /** editSessionId → true once its connection stopped for good */
  stopped: Record<string, boolean>;
}

const useYjsSyncStore = create<YjsSyncState>(() => ({
  synced: {},
  stopped: {},
}));

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

  const serverUrl = toWsUrl(appConfig.yjsUrl!);
  // The session is the entity's document, and a token opens that one document only.
  const tokenKey = yjsTokenKey(entityType, editSessionId);
  const token = useUserStore.getState().yjsTokens[tokenKey];
  if (!token) throw new Error(`[yjs] No token available for ${tokenKey}`);

  const yDoc = new Y.Doc();
  const provider = new WebsocketProvider(serverUrl, editSessionId, yDoc, {
    params: { token, entityType, tenantId },
    connect: onlineManager.isOnline() !== false,
    maxBackoffTime: MAX_BACKOFF_MS,
  });
  const fragment = yDoc.getXmlFragment('document-store');
  const conn: YjsConnection = { yDoc, provider, fragment, refCount: 1, stopped: false };

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

  // Counts refusals since the last synced connection: the relay closes an unusable token right after the handshake,
  // so a connection that merely opened proves nothing.
  let tokenFailures = 0;
  provider.on('sync', (isSynced: boolean) => {
    if (isSynced) tokenFailures = 0;
  });

  provider.on('connection-close', (event: CloseEvent | null) => {
    // A local close carries no event; it and every transient close reconnect with backoff.
    if (!event || conn.stopped) return;

    // The relay closes an expired or invalid token with 4001: a refetched token reaches the provider params before
    // y-websocket reconnects, so only repeated refusals with no synced connection between them stop the connection.
    if (event.code === YJS_CLOSE.TOKEN_INVALID) {
      tokenFailures++;
      void queryClient.invalidateQueries({ queryKey: yjsTokenKeys.entity(entityType, editSessionId) });
      if (tokenFailures < MAX_TOKEN_FAILURES) return;
      console.warn(`[yjs] Circuit breaker: ${tokenFailures} consecutive token failures for ${editSessionId}`);
      stopConnection(editSessionId, conn, 'error:sync_token_expired.text');
      return;
    }

    const message = FINAL_CLOSES.get(event.code);
    if (message) stopConnection(editSessionId, conn, message);
  });

  conn.stopResyncWatch = watchPendingStructs(yDoc, provider);
  connections.set(editSessionId, conn);

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

  return conn;
}

function destroyConnection(editSessionId: string, conn: YjsConnection) {
  conn.unsubOnline?.();
  conn.unsubToken?.();
  conn.stopResyncWatch?.();
  conn.provider.destroy();
  conn.yDoc.destroy();
  connections.delete(editSessionId);
  useYjsSyncStore.setState((s) => {
    const { [editSessionId]: _synced, ...synced } = s.synced;
    const { [editSessionId]: _stopped, ...stopped } = s.stopped;
    return { synced, stopped };
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
 * `undefined` disables it. `stopped` turns true once the relay ended the session for good: the editor must go read-only.
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

  if (!conn) return null;
  return { provider: conn.provider, fragment: conn.fragment, synced, stopped };
}
