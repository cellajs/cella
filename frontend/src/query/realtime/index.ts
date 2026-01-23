/**
 * Realtime sync utilities.
 *
 * Provides SSE streaming and multi-tab coordination for RealtimeEntityType:
 * - Live stream connection (SSE)
 * - Multi-tab leader election
 * - Stream offset persistence
 * - Sync state coordination
 */

export {
  clearAllOffsets,
  clearStoredOffset,
  getStoredOffset,
  updateStoredOffset,
  useOffsetStore,
} from './offset-store';
export type {
  OffsetEvent,
  StreamMessage,
  StreamState,
  StreamTx,
  UseLiveStreamOptions,
  UseLiveStreamReturn,
} from './stream-types';
export { useSyncCoordinatorStore } from './sync-coordinator';
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
export { useLiveStream } from './use-live-stream';
