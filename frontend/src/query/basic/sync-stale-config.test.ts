import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isSyncDeliveryTrusted,
  setSyncDeliveryTrusted,
  setSyncStreamHealthy,
  syncStaleTime,
} from './sync-stale-config';

const FIVE_MINUTES = 5 * 60 * 1000;

/** Verifies that healthy catch-up state keeps restored product queries fresh across reloads. */
describe('syncStaleTime freshness contract', () => {
  // Module-level flags are shared; reset to the healthy default around each case.
  beforeEach(() => {
    setSyncStreamHealthy(true);
    setSyncDeliveryTrusted(true);
  });
  afterEach(() => {
    setSyncStreamHealthy(true);
    setSyncDeliveryTrusted(true);
  });

  it('is infinite while the stream is healthy and deliveries are trusted (catchup owns freshness)', () => {
    expect(syncStaleTime()).toBe(Number.POSITIVE_INFINITY);
  });

  it('starts healthy+trusted on a fresh module load so the first reload prefetch trusts the warm cache', async () => {
    vi.resetModules();
    const fresh = await import('./sync-stale-config');
    expect(fresh.syncStaleTime()).toBe(Number.POSITIVE_INFINITY);
  });

  it('falls back to a 5 minute stale time when the stream is unhealthy (error state)', () => {
    setSyncStreamHealthy(false);
    expect(syncStaleTime()).toBe(FIVE_MINUTES);
  });

  it('falls back to 5 minutes when a delivery shortfall breaks trust, even while the stream is healthy', () => {
    setSyncDeliveryTrusted(false);
    expect(isSyncDeliveryTrusted()).toBe(false);
    expect(syncStaleTime()).toBe(FIVE_MINUTES);
  });

  it('restores infinite freshness once the stream is healthy again and trust is regained', () => {
    setSyncStreamHealthy(false);
    setSyncDeliveryTrusted(false);
    expect(syncStaleTime()).toBe(FIVE_MINUTES);

    setSyncStreamHealthy(true);
    setSyncDeliveryTrusted(true);
    expect(syncStaleTime()).toBe(Number.POSITIVE_INFINITY);
  });
});
