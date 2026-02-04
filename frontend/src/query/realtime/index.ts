/**
 * Realtime sync utilities.
 *
 * Provides SSE streaming and multi-tab coordination for ProductEntityType:
 * - Live stream connection (SSE)
 * - Multi-tab leader election
 * - Sync state coordination
 */

export { default as AppStream, useAppStream } from './app-stream';
export { handleAppStreamNotification } from './app-stream-handler';
export type {
  AppStreamNotification,
  AppStreamOffsetEvent,
  BaseStreamOptions,
  BaseStreamReturn,
  StreamState,
  UseAppStreamOptions,
  UseAppStreamReturn,
} from './types';
// Cache token utilities for server-side entity cache
export {
  clearCacheTokens,
  getCacheToken,
  getCacheTokenStats,
  removeCacheToken,
  storeCacheToken,
} from './cache-token-store';
export type { UsePublicStreamOptions, UsePublicStreamReturn } from './public-stream';
export { default as PublicStream, getPageStreamCursor, usePublicStream } from './public-stream';
export { handlePublicStreamMessage, type PublicStreamMessage } from './public-stream-handler';
export {
  broadcastNotification,
  cleanupTabCoordinator,
  initTabCoordinator,
  isLeader,
  onNotification,
  useTabCoordinator,
  useTabCoordinatorStore,
} from './tab-coordinator';
export type { UseLeaderReconnectOptions } from './use-leader-reconnect';
export { useLeaderReconnect } from './use-leader-reconnect';
export type { SSEEventHandlers, UseSSEConnectionOptions, UseSSEConnectionReturn } from './use-sse-connection';
export { useSSEConnection } from './use-sse-connection';
export type { UseVisibilityReconnectOptions } from './use-visibility-reconnect';
export { useVisibilityReconnect } from './use-visibility-reconnect';
