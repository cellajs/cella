/**
 * Realtime sync utilities.
 *
 * Provides SSE streaming and multi-tab coordination for RealtimeEntityType:
 * - Live stream connection (SSE)
 * - Multi-tab leader election
 * - Sync state coordination
 */

export { default as AppStream, useAppStream } from './app-stream';
export { handleAppStreamMessage } from './app-stream-handler';
export type {
  AppStreamMessage,
  AppStreamOffsetEvent,
  BaseStreamOptions,
  BaseStreamReturn,
  StreamState,
  UseAppStreamOptions,
  UseAppStreamReturn,
  UsePublicStreamOptions,
  UsePublicStreamReturn,
} from './app-stream-types';
// Cache token utilities for LRU entity cache
export {
  clearCacheTokens,
  getCacheToken,
  getCacheTokenEntry,
  getCacheTokenStats,
  removeCacheToken,
  storeCacheToken,
} from './cache-token-store';
export type { HydrateBarrier, UseHydrateBarrierOptions, UseHydrateBarrierReturn } from './hydrate-barrier';
export { createHydrateBarrier, useHydrateBarrier } from './hydrate-barrier';
export { default as PublicStream, usePublicStream } from './public-stream';
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
