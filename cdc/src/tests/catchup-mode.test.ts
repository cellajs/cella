import { describe, it, expect, vi, beforeEach } from 'vitest';

import { replicationState } from '../services/replication-state';

describe('Catchup mode — replicationState', () => {
  beforeEach(() => {
    replicationState.reset();
    vi.clearAllMocks();
  });

  describe('updateLag — entering catchup', () => {
    it('does not enter catchup below threshold', () => {
      const result = replicationState.updateLag(5_000);
      expect(result).toBe(false);
      expect(replicationState.catchingUp).toBe(false);
    });

    it('enters catchup when lag exceeds 10s', () => {
      const result = replicationState.updateLag(11_000);
      expect(result).toBe(true);
      expect(replicationState.catchingUp).toBe(true);
      expect(replicationState.catchupStartedAt).toBeTypeOf('number');
      expect(replicationState.catchupEventsProcessed).toBe(0);
    });

    it('does not enter catchup at exactly the threshold', () => {
      const result = replicationState.updateLag(10_000);
      expect(result).toBe(false);
      expect(replicationState.catchingUp).toBe(false);
    });
  });

  describe('updateLag — exiting catchup (hysteresis)', () => {
    beforeEach(() => {
      // Enter catchup mode
      replicationState.updateLag(15_000);
      expect(replicationState.catchingUp).toBe(true);
    });

    it('does not exit on a single low-lag transaction', () => {
      replicationState.updateLag(1_000);
      expect(replicationState.catchingUp).toBe(true);
    });

    it('does not exit on 2 consecutive low-lag transactions', () => {
      replicationState.updateLag(1_000);
      replicationState.updateLag(1_000);
      expect(replicationState.catchingUp).toBe(true);
    });

    it('exits after 3 consecutive low-lag transactions', () => {
      replicationState.updateLag(1_000);
      replicationState.updateLag(1_500);
      const result = replicationState.updateLag(500);
      expect(result).toBe(false);
      expect(replicationState.catchingUp).toBe(false);
    });

    it('resets consecutive counter on a high-lag spike', () => {
      replicationState.updateLag(1_000);
      replicationState.updateLag(1_000);
      // Spike, resets counter
      replicationState.updateLag(5_000);
      // Start counting again
      replicationState.updateLag(1_000);
      replicationState.updateLag(1_000);
      // Only 2 consecutive, not 3
      expect(replicationState.catchingUp).toBe(true);
    });

    it('does not exit when lag is at exactly the exit threshold', () => {
      replicationState.updateLag(2_000);
      replicationState.updateLag(2_000);
      replicationState.updateLag(2_000);
      // exitLagMs is 2000, lag must be < 2000 to count
      expect(replicationState.catchingUp).toBe(true);
    });
  });

  describe('incrementCatchupEvents', () => {
    it('increments by 1 by default', () => {
      replicationState.incrementCatchupEvents();
      replicationState.incrementCatchupEvents();
      expect(replicationState.catchupEventsProcessed).toBe(2);
    });

    it('increments by a custom count', () => {
      replicationState.incrementCatchupEvents(10);
      expect(replicationState.catchupEventsProcessed).toBe(10);
    });
  });

  describe('resetCatchup', () => {
    it('clears catchup tracking state but not catchingUp flag', () => {
      replicationState.updateLag(15_000);
      replicationState.incrementCatchupEvents(50);

      replicationState.resetCatchup();

      expect(replicationState.catchupStartedAt).toBeNull();
      expect(replicationState.catchupEventsProcessed).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears everything including catchup state', () => {
      replicationState.updateLag(15_000);
      replicationState.incrementCatchupEvents(100);
      replicationState.lastLsn = '0/ABCDEF';
      replicationState.status = 'active';

      replicationState.reset();

      expect(replicationState.catchingUp).toBe(false);
      expect(replicationState.catchupStartedAt).toBeNull();
      expect(replicationState.catchupEventsProcessed).toBe(0);
      expect(replicationState.lastLagMs).toBeNull();
      expect(replicationState.lastLsn).toBeNull();
      expect(replicationState.status).toBe('stopped');
    });
  });
});
