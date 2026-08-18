import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import { useEffect, useState } from 'react';
import { appConfig, type ProductEntityType } from 'shared';
import { toWsUrl } from 'shared/utils/ws-url';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { create } from 'zustand';
import { toaster } from '~/modules/common/toaster/toaster';
import { useUserStore, yjsTokenKey } from '~/modules/user/user-store';

const GRACE_PERIOD_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;

// Stop repeated token failures after the WebSocket backoff safety threshold and notify the user.
const MAX_TOKEN_FAILURES = 5;

/** WebSocket close codes sent by the Yjs relay; the 4000-4999 range is reserved for application use. */
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

  const unsubOnline = onlineManager.subscribe((isOnline) => {
    if (isOnline) provider.connect();
    else provider.disconnect();
  });

  // Keep provider params on the latest token so a reconnect after sleep uses a fresh one.
  const unsubToken = useUserStore.subscribe((state) => {
    const newToken = state.yjsTokens[tokenKey];
    if (newToken && provider.params) {
      (provider.params as Record<string, string>).token = newToken;
    }
  });

  let tokenFailures = 0;

  provider.on('status', ({ status }: { status: string }) => {
    if (status === 'connected') tokenFailures = 0;
  });

  const handleConnectionClose = (event: CloseEvent | null) => {
    if (!event || event.code === 1000) return;

    // TOKEN_INVALID is recoverable: backoff gives the refresher time to push a fresh token, so give up only after MAX_TOKEN_FAILURES.
    if (event.code === YJS_CLOSE.TOKEN_INVALID) {
      tokenFailures++;
      if (tokenFailures < MAX_TOKEN_FAILURES) return;
      console.warn(`[yjs] Circuit breaker: ${tokenFailures} consecutive token failures for ${editSessionId}`);
    }

    // Non-recoverable or circuit breaker tripped: stop retrying.
    provider.off('connection-close', handleConnectionClose);
    provider.disconnect();

    switch (event.code) {
      case YJS_CLOSE.TOKEN_INVALID:
        toaster.warning(i18n.t('error:sync_token_expired.text'));
        break;
      case YJS_CLOSE.ACCESS_DENIED:
        toaster.warning(i18n.t('error:no_permission_for_sync.text'));
        break;
      case YJS_CLOSE.BACKEND_UNAVAILABLE:
        toaster.warning(i18n.t('error:sync_unavailable.text'));
        break;
      default:
        toaster.warning(i18n.t('error:sync_failed.text'));
    }

    // Clearing the token disables collaborative mode until the next refresh.
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

/** Ref-counted Yjs connection kept alive for a grace period after the last consumer unmounts, so a remount reuses it; `undefined` disables it. */
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

  if (!conn) return null;
  return { provider: conn.provider, fragment: conn.fragment, synced };
}
