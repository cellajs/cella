import { UniqueEnforcer } from 'enforce-unique';

const enforcers = new Set<UniqueEnforcer>();

/**
 * An enforcer for the unique values a mock generates (a name, a slug, an address). Every one made here is reset by
 * {@link resetMockEnforcers}, so a module's mocks need no reset function of their own.
 */
export const mockUniqueEnforcer = (): UniqueEnforcer => {
  const enforcer = new UniqueEnforcer();
  enforcers.add(enforcer);
  return enforcer;
};

/** Forgets the values every mock enforcer gave out. Called when the test database is cleared, so the next test starts with all of them free. */
export const resetMockEnforcers = () => {
  for (const enforcer of enforcers) enforcer.reset();
};
