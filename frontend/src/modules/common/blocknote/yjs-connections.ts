import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import { useEffect, useState } from 'react';
import { appConfig, type ProductEntityType } from 'shared';
import { toWsUrl } from 'shared/ws-url';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { create } from 'zustand';
import { toaster } from '~/modules/common/toaster/toaster';
import { useUserStore, yjsTokenKey } from '~/modules/user/user-store';

const GRACE_PERIOD_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;

// Safety-net circuit breaker: after this many consecutive token failures
// we stop retrying and show a toast. Normally the server rejects at HTTP
// level (no WS upgrade), so y-websocket's exponential backoff works, but
// this guards against edge cases (e.g. mismatched secrets).
const MAX_TOKEN_FAILURES = 5;

/**
 * Application-specific WebSocket close codes sent by the Yjs relay.
 * Codes in the 4000-4999 range are reserved for application use.
 */
const YJS_CLOSE = {
  TOKEN_INVALID: 4001,
  ACCESS_DENIED: 4003,
  BAD_REQUEST: 4400,
  BACKEND_UNAVAILABLE: 4503,
} as const;

interface YjsConnection {
  yDoc: Y.Doc;
  provider: WebsocketProvider;
  fragment: Y.XmlFragment;
  refCount: number;
  graceTimer?: ReturnType<typeof setTimeout>;
  unsubOnline?: () => void;
  unsubToken?: () => void;
}

/** Module-level connection map; mutations happen outside React render. */
const connections = new Map<string, YjsConnection>();

interface YjsSyncState {
  /** editSessionId → synced boolean */
  synced: Record<string, boolean>;
}

/** Reactive store for sync status so React components can subscribe. */
const useYjsSyncStore = create<YjsSyncState>(() => ({
  synced: {},
}));

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
  const tokenKey = yjsTokenKey(entityType, tenantId);
  const token = useUserStore.getState().yjsTokens[tokenKey];
  if (!token) throw new Error(`[yjs] No token available for ${tokenKey}`);

  const yDoc = new Y.Doc();
  const provider = new WebsocketProvider(serverUrl, editSessionId, yDoc, {
    params: { token, entityType, tenantId },
    connect: onlineManager.isOnline() !== false,
    maxBackoffTime: MAX_BACKOFF_MS,
  });
  const fragment = yDoc.getXmlFragment('document-store');

  // Pause/resume WebSocket when online state changes
  const unsubOnline = onlineManager.subscribe((isOnline) => {
    if (isOnline) provider.connect();
    else provider.disconnect();
  });

  // Keep provider params in sync with the latest token from the store.
  // Reconnects after sleep/background use a fresh token.
  const unsubToken = useUserStore.subscribe((state) => {
    const newToken = state.yjsTokens[tokenKey];
    if (newToken && provider.params) {
      (provider.params as Record<string, string>).token = newToken;
    }
  });

  // Safety-net circuit breaker for token failures.
  let tokenFailures = 0;

  provider.on('status', ({ status }: { status: string }) => {
    if (status === 'connected') tokenFailures = 0;
  });

  const handleConnectionClose = (event: CloseEvent | null) => {
    if (!event || event.code === 1000) return;

    // TOKEN_INVALID is recoverable: y-websocket's exponential backoff
    // gives the token refresher time to push a fresh token via the store
    // subscription. Only give up after MAX_TOKEN_FAILURES consecutive hits.
    if (event.code === YJS_CLOSE.TOKEN_INVALID) {
      tokenFailures++;
      if (tokenFailures < MAX_TOKEN_FAILURES) return;
      console.warn(`[yjs] Circuit breaker: ${tokenFailures} consecutive token failures for ${editSessionId}`);
    }

    // Non-recoverable or circuit breaker tripped: stop retrying.
    provider.off('connection-close', handleConnectionClose);
    provider.disconnect();

    // Show user-facing feedback based on close code
    switch (event.code) {
      case YJS_CLOSE.TOKEN_INVALID:
        toaster(i18n.t('error:sync_token_expired.text'), 'warning');
        break;
      case YJS_CLOSE.ACCESS_DENIED:
        toaster(i18n.t('error:no_permission_for_sync.text'), 'warning');
        break;
      case YJS_CLOSE.BACKEND_UNAVAILABLE:
        toaster(i18n.t('error:sync_unavailable.text'), 'warning');
        break;
      default:
        toaster(i18n.t('error:sync_failed.text'), 'warning');
    }

    // Clear token for this entity type so collaborative mode is disabled until refresh
    useUserStore.getState().setYjsToken(tokenKey, null);
  };
  provider.on('connection-close', handleConnectionClose);

  const conn: YjsConnection = { yDoc, provider, fragment, refCount: 1, unsubOnline, unsubToken };
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

function releaseConnection(editSessionId: string) {
  const conn = connections.get(editSessionId);
  if (!conn) return;

  conn.refCount--;
  if (conn.refCount <= 0) {
    conn.graceTimer = setTimeout(() => {
      conn.unsubOnline?.();
      conn.unsubToken?.();
      conn.provider.destroy();
      conn.yDoc.destroy();
      connections.delete(editSessionId);
      useYjsSyncStore.setState((s) => {
        const { [editSessionId]: _, ...rest } = s.synced;
        return { synced: rest };
      });
    }, GRACE_PERIOD_MS);
  }
}

/**
 * Acquires a Yjs connection on mount, releases on unmount.
 * The connection (Y.Doc + WebsocketProvider) is ref-counted and survives
 * a 30 s grace period after the last consumer unmounts, enabling instant
 * remounts without reconnecting or re-seeding.
 *
 * Pass `undefined` for editSessionId to disable (returns `null`).
 */
export function useYjsConnection(editSessionId: string | undefined, entityType: ProductEntityType, tenantId: string) {
  const [conn, setConn] = useState<YjsConnection | null>(() => {
    // Check for a cached connection (instant remounts within grace period)
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

  if (!conn) return null;
  return { provider: conn.provider, fragment: conn.fragment, synced };
}
