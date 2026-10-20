/** Hands out values a generator makes, each value once until {@link resetMockEnforcers}. */
interface MockUniqueEnforcer {
  /** Calls `generate` until it returns an unused value; throws once `maxRetries` repeats or `maxTime` ms are spent (50 each). */
  enforce<T>(generate: () => T, limits?: { maxTime?: number; maxRetries?: number }): T;
}

const usedValueSets = new Set<Set<string>>();

/**
 * An enforcer for the unique values a mock generates (a name, a slug, an address). Every one made here is reset by
 * {@link resetMockEnforcers}, so a module's mocks need no reset function of their own.
 */
export const mockUniqueEnforcer = (): MockUniqueEnforcer => {
  const used = new Set<string>();
  usedValueSets.add(used);
  return {
    enforce(generate, { maxTime = 50, maxRetries = 50 } = {}) {
      const startedAt = Date.now();
      for (let retries = 0; retries <= maxRetries && Date.now() - startedAt <= maxTime; retries++) {
        const value = generate();
        const key = JSON.stringify(value);
        if (used.has(key)) continue;
        used.add(key);
        return value;
      }
      throw new Error(`No unused mock value after ${maxRetries} retries or ${maxTime} ms`);
    },
  };
};

/** Forgets the values every mock enforcer gave out. Called when the test database is cleared, so the next test starts with all of them free. */
export const resetMockEnforcers = () => {
  for (const used of usedValueSets) used.clear();
};
