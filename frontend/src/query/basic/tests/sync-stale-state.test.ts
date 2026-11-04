import { afterEach, describe, expect, it } from 'vitest';
import { setSyncStreamHealthy, setSyncWorkerAway, syncStaleTime } from '~/query/basic/sync-stale-state';

const fiveMinutes = 5 * 60 * 1000;

/** The healthy default; module-level flags are shared across cases. */
const restoreHealthy = () => {
  setSyncStreamHealthy(true);
  setSyncWorkerAway(false);
};

describe('syncStaleTime freshness contract', () => {
  afterEach(restoreHealthy);

  it("keeps product queries fresh only while the stream is healthy and the server's worker reads", () => {
    restoreHealthy();
    expect(syncStaleTime()).toBe(Number.POSITIVE_INFINITY);

    // A worker that is away leaves the stream open and healthy, and brings nothing.
    for (const fail of [() => setSyncStreamHealthy(false), () => setSyncWorkerAway(true)]) {
      fail();
      expect(syncStaleTime()).toBe(fiveMinutes);
      restoreHealthy();
      expect(syncStaleTime()).toBe(Number.POSITIVE_INFINITY);
    }
  });
});
