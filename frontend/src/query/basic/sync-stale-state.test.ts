import { afterEach, describe, expect, it } from 'vitest';
import { setSyncDeliveryTrusted, setSyncStreamHealthy, setSyncWorkerAway, syncStaleTime } from './sync-stale-state';

const FIVE_MINUTES = 5 * 60 * 1000;

/** The healthy default; module-level flags are shared across cases. */
const restoreHealthy = () => {
  setSyncStreamHealthy(true);
  setSyncDeliveryTrusted(true);
  setSyncWorkerAway(false);
};

describe('syncStaleTime freshness contract', () => {
  afterEach(restoreHealthy);

  it("keeps product queries fresh only while the stream is healthy, deliveries reconcile and the server's worker reads", () => {
    restoreHealthy();
    expect(syncStaleTime()).toBe(Number.POSITIVE_INFINITY);

    // A worker that is away leaves the stream open and healthy, and brings nothing.
    for (const fail of [() => setSyncStreamHealthy(false), () => setSyncDeliveryTrusted(false), () => setSyncWorkerAway(true)]) {
      fail();
      expect(syncStaleTime()).toBe(FIVE_MINUTES);
      restoreHealthy();
      expect(syncStaleTime()).toBe(Number.POSITIVE_INFINITY);
    }
  });
});
