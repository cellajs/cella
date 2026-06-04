import { describe, it, expect, vi, beforeEach } from 'vitest';

import { circuitBreaker } from '../services/circuit-breaker';
import { logEvent } from '../lib/pino';

// Access private state for reset between tests
function resetCircuitBreaker() {
  // @ts-expect-error — accessing private field for test isolation
  circuitBreaker.circuits.clear();
}

describe('CircuitBreaker', () => {
  beforeEach(() => {
    resetCircuitBreaker();
    vi.clearAllMocks();
  });

  describe('shouldProcess', () => {
    it('allows processing for unknown tables (default closed)', () => {
      expect(circuitBreaker.shouldProcess('tasks')).toBe(true);
    });

    it('allows processing when failures are below threshold', () => {
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');
      expect(circuitBreaker.shouldProcess('tasks')).toBe(true);
    });

    it('blocks processing when circuit is open', () => {
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');
      expect(circuitBreaker.shouldProcess('tasks')).toBe(false);
    });

    it('increments skippedCount while open', () => {
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');

      circuitBreaker.shouldProcess('tasks');
      circuitBreaker.shouldProcess('tasks');

      const status = circuitBreaker.getStatus();
      expect(status.tasks.skippedCount).toBe(2);
    });
  });

  describe('recordFailure', () => {
    it('opens circuit after 3 consecutive failures', () => {
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');
      expect(circuitBreaker.shouldProcess('tasks')).toBe(true);

      circuitBreaker.recordFailure('tasks');
      expect(circuitBreaker.shouldProcess('tasks')).toBe(false);
      expect(logEvent).toHaveBeenCalledWith('warn', expect.stringContaining('Circuit OPEN'), expect.any(Object));
    });

    it('tracks failures independently per table', () => {
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');

      // tasks is open, but labels should still work
      expect(circuitBreaker.shouldProcess('tasks')).toBe(false);
      expect(circuitBreaker.shouldProcess('labels')).toBe(true);
    });
  });

  describe('recordSuccess', () => {
    it('resets failure count', () => {
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordSuccess('tasks');

      // After success, 2 more failures should NOT open circuit (count was reset)
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');
      expect(circuitBreaker.shouldProcess('tasks')).toBe(true);
    });

    it('is a no-op for tables with no failures', () => {
      circuitBreaker.recordSuccess('tasks');
      expect(logEvent).not.toHaveBeenCalled();
    });
  });

  describe('half_open recovery', () => {
    it('transitions to half_open after cooldown', () => {
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');

      // Fast-forward past cooldown
      // @ts-expect-error — accessing private field for test
      const entry = circuitBreaker.circuits.get('tasks')!;
      entry.openedAt = Date.now() - 61_000;

      expect(circuitBreaker.shouldProcess('tasks')).toBe(true);
      expect(entry.state).toBe('half_open');
    });

    it('closes circuit on success in half_open', () => {
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');

      // @ts-expect-error — accessing private field for test
      const entry = circuitBreaker.circuits.get('tasks')!;
      entry.openedAt = Date.now() - 61_000;
      circuitBreaker.shouldProcess('tasks'); // triggers half_open

      circuitBreaker.recordSuccess('tasks');
      expect(circuitBreaker.shouldProcess('tasks')).toBe(true);
      expect(logEvent).toHaveBeenCalledWith('info', expect.stringContaining('Circuit CLOSED'), expect.any(Object));
    });

    it('re-opens circuit on failure in half_open', () => {
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');

      // @ts-expect-error — accessing private field for test
      const entry = circuitBreaker.circuits.get('tasks')!;
      entry.openedAt = Date.now() - 61_000;
      circuitBreaker.shouldProcess('tasks'); // triggers half_open

      circuitBreaker.recordFailure('tasks');
      expect(circuitBreaker.shouldProcess('tasks')).toBe(false);
      expect(logEvent).toHaveBeenCalledWith('warn', expect.stringContaining('re-OPENED'), expect.any(Object));
    });
  });

  describe('getStatus', () => {
    it('returns empty object when all circuits are healthy', () => {
      expect(circuitBreaker.getStatus()).toEqual({});
    });

    it('returns entries with failures or non-closed state', () => {
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordFailure('labels');

      const status = circuitBreaker.getStatus();
      expect(status.tasks).toEqual(expect.objectContaining({ state: 'open', failureCount: 3 }));
      expect(status.labels).toEqual(expect.objectContaining({ state: 'closed', failureCount: 1 }));
    });

    it('excludes healthy tables', () => {
      circuitBreaker.recordFailure('tasks');
      circuitBreaker.recordSuccess('tasks');

      const status = circuitBreaker.getStatus();
      expect(status.tasks).toBeUndefined();
    });
  });
});
