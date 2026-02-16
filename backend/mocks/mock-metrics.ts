/**
 * Mock generators for metrics schemas.
 * Used for OpenAPI examples.
 */

import { withFakerSeed } from './utils';

export const mockMetricsListResponse = (key = 'metrics:list') =>
  withFakerSeed(key, () => [
    { date: '2026-01-01', count: 42 },
    { date: '2026-01-02', count: 58 },
  ]);

export const mockRuntimeMetricsResponse = (key = 'metrics:runtime') =>
  withFakerSeed(key, () => ({
    process: {
      uptime: 86400,
      memory: {
        heapUsed: 52428800,
        heapTotal: 104857600,
        external: 2097152,
        rss: 134217728,
      },
      cpu: {
        user: 150000,
        system: 30000,
      },
    },
    otel: [],
  }));

export const mockPublicCountsResponse = (key = 'metrics:public-counts') =>
  withFakerSeed(key, () => ({
    user: 150,
    organization: 12,
  }));

export const mockCacheStatsResponse = (key = 'metrics:cache') =>
  withFakerSeed(key, () => ({
    cache: {
      hits: 1250,
      misses: 85,
      hitRate: 93.6,
      invalidations: 42,
      coalescedRequests: 156,
      totalRequests: 1335,
      uptimeSeconds: 3600,
      size: 420,
      capacity: 1000,
      utilization: 0.42,
    },
  }));

export const mockSyncMetricsResponse = (key = 'metrics:sync') =>
  withFakerSeed(key, () => ({
    messagesReceived: 5420,
    notificationsSent: 3180,
    activeConnections: 24,
    pgNotifyFallbacks: 3,
    recentSpanCount: 150,
    spansByName: { 'cdc.process': 2100, 'sse.broadcast': 3180 },
    avgDurationByName: { 'cdc.process': 12.5, 'sse.broadcast': 1.2 },
    errorCount: 7,
  }));
