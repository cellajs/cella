import { describe, expect, it } from 'vitest';
import { mockUniqueEnforcer, resetMockEnforcers } from './mock-unique';

describe('mockUniqueEnforcer', () => {
  it('skips values it gave out before', () => {
    const enforcer = mockUniqueEnforcer();
    const values = ['a', 'a', 'b', 'a', 'b', 'c'];
    const next = () => values.shift() as string;

    expect([enforcer.enforce(next), enforcer.enforce(next), enforcer.enforce(next)]).toEqual(['a', 'b', 'c']);
  });

  it('throws when the generator keeps repeating', () => {
    const enforcer = mockUniqueEnforcer();
    enforcer.enforce(() => 'same');

    expect(() => enforcer.enforce(() => 'same', { maxRetries: 5 })).toThrow('No unused mock value');
  });

  it('gives every value out again after a reset', () => {
    const enforcer = mockUniqueEnforcer();
    enforcer.enforce(() => 'a');
    resetMockEnforcers();

    expect(enforcer.enforce(() => 'a')).toBe('a');
  });
});
