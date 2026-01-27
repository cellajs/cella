/**
 * Centralized span names for all tracing layers.
 *
 * Organized by layer (cdc, backend, frontend) for type-safe usage.
 * All span names follow the convention: layer.domain.action
 */

// ================================
// CDC Span Names
// ================================

export const cdcSpanNames = {
  processWal: 'cdc.wal.process',
  createActivity: 'cdc.activity.create',
  sendWs: 'cdc.ws.send',
  enrichMembership: 'cdc.enrich.membership',
  heartbeat: 'cdc.heartbeat',
  reconnect: 'cdc.ws.reconnect',
} as const;

export type CdcSpanName = (typeof cdcSpanNames)[keyof typeof cdcSpanNames];

// ================================
// Backend Span Names
// ================================

export const backendSpanNames = {
  // ActivityBus
  activityBusReceive: 'sync.activitybus.receive',
  activityBusEmit: 'sync.activitybus.emit',
  activityBusPgNotify: 'sync.activitybus.pg_notify',

  // SSE Streams
  sseConnect: 'sync.sse.connect',
  sseDisconnect: 'sync.sse.disconnect',
  sseSend: 'sync.sse.send',
  sseCatchUp: 'sync.sse.catchup',
} as const;

export type BackendSpanName = (typeof backendSpanNames)[keyof typeof backendSpanNames];

// ================================
// Frontend Span Names
// ================================

export const frontendSpanNames = {
  // SSE connection
  sseConnect: 'sync.sse.connect',
  sseReceive: 'sync.sse.receive',
  sseReconnect: 'sync.sse.reconnect',
  sseCatchUp: 'sync.sse.catchup',

  // Message handling
  messageProcess: 'sync.message.process',
  messageBroadcast: 'sync.message.broadcast',

  // Cache operations
  cacheUpdate: 'sync.cache.update',
  cacheInvalidate: 'sync.cache.invalidate',
  cacheHit: 'sync.cache.hit',
  cacheMiss: 'sync.cache.miss',

  // Sequence tracking
  seqGap: 'sync.seq.gap',
  seqUpdate: 'sync.seq.update',
} as const;

export type FrontendSpanName = (typeof frontendSpanNames)[keyof typeof frontendSpanNames];

// ================================
// Combined Span Names
// ================================

/** All span names organized by layer. */
export const spanNames = {
  cdc: cdcSpanNames,
  backend: backendSpanNames,
  frontend: frontendSpanNames,
} as const;

/** Union of all valid span names. */
export type SpanName = CdcSpanName | BackendSpanName | FrontendSpanName;
