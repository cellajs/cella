import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, syncFromDb, tryFastConsume } from '#/middlewares/rate-limiter/points-cache';

describe('points-cache', () => {
  beforeEach(() => {
    clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('tryFastConsume', () => {
    it('should allow first request for a new key', () => {
      expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('allow');
    });

    it('should allow requests well under budget (< 80%)', () => {
      // Budget = 1000, threshold = 800
      for (let i = 0; i < 500; i++) {
        expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('allow');
      }
    });

    it('should return check-db when approaching budget threshold', () => {
      // Consume 799 points (under 80% of 1000)
      for (let i = 0; i < 799; i++) {
        tryFastConsume('tenant:user1', 1, 1000);
      }
      // Point 800 should trigger check-db (800 >= 1000 * 0.8)
      expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('check-db');
    });

    it('should handle bulk costs correctly', () => {
      // Budget = 100, threshold = 80. Cost = 10 per request.
      for (let i = 0; i < 7; i++) {
        expect(tryFastConsume('tenant:user1', 10, 100)).toBe('allow');
      }
      // 70 consumed, next adds 10 → 80 >= 80 threshold → check-db
      expect(tryFastConsume('tenant:user1', 10, 100)).toBe('check-db');
    });

    it('should track keys independently', () => {
      // Fill user1 near threshold
      for (let i = 0; i < 799; i++) {
        tryFastConsume('tenant:user1', 1, 1000);
      }
      // user1 should be near limit
      expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('check-db');
      // user2 should still be allowed
      expect(tryFastConsume('tenant:user2', 1, 1000)).toBe('allow');
    });

    it('should reset counter when window expires', () => {
      vi.useFakeTimers();

      // Consume up to threshold
      for (let i = 0; i < 800; i++) {
        tryFastConsume('tenant:user1', 1, 1000);
      }
      expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('check-db');

      // Advance past the 1-hour window
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);

      // Should start fresh
      expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('allow');

      vi.useRealTimers();
    });
  });

  describe('syncFromDb', () => {
    it('should update cache with authoritative DB count', () => {
      // Start with some local state
      tryFastConsume('tenant:user1', 1, 1000);

      // DB says 900 points consumed (other processes counted too)
      syncFromDb('tenant:user1', 900);

      // Now should go to DB since 900 + 1 > 800 threshold
      expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('check-db');
    });

    it('should create entry for unknown key', () => {
      syncFromDb('tenant:new', 500);
      // 500 + 1 = 501 < 800 threshold → allow
      expect(tryFastConsume('tenant:new', 1, 1000)).toBe('allow');
    });
  });
});
