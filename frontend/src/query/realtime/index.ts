/**
 * Realtime sync utilities.
 *
 * Provides SSE streaming and multi-tab coordination for RealtimeEntityType:
 * - Live stream connection (SSE)
 * - Multi-tab leader election
 * - Stream offset persistence
 * - Sync state coordination
 */

export type { HydrateBarrier, UseHydrateBarrierOptions, UseHydrateBarrierReturn } from './hydrate-barrier';
export { createHydrateBarrier, useHydrateBarrier } from './hydrate-barrier';
export {
  clearAllOffsets,
  clearStoredOffset,
  getStoredOffset,
  updateStoredOffset,
  useOffsetStore,
} from './offset-store';
export {
  broadcastCursorUpdate,
  broadcastStreamMessage,
  cleanupTabCoordinator,
  initTabCoordinator,
  isLeader,
  onCursorUpdate,
  onStreamMessage,
  requestSync,
  useTabCoordinator,
  useTabCoordinatorStore,
} from './tab-coordinator';
export type { UseLeaderReconnectOptions } from './use-leader-reconnect';
export { useLeaderReconnect } from './use-leader-reconnect';
export type { UsePageLiveStreamOptions, UsePageLiveStreamReturn } from './use-page-live-stream';
export { usePageLiveStream } from './use-page-live-stream';
export type { SSEEventHandlers, UseSSEConnectionOptions, UseSSEConnectionReturn } from './use-sse-connection';
export { useSSEConnection } from './use-sse-connection';
export { useUserStream } from './use-user-stream';
export type { UseVisibilityReconnectOptions } from './use-visibility-reconnect';
export { useVisibilityReconnect } from './use-visibility-reconnect';
export { handleUserStreamMessage } from './user-stream-handler';
export type {
  StreamState,
  UserStreamMessage,
  UserStreamOffsetEvent,
  /** @deprecated Use StreamState instead */
  UserStreamState,
  UseUserStreamOptions,
  UseUserStreamReturn,
} from './user-stream-types';
