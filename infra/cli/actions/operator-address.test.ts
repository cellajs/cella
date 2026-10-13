import { describe, expect, it } from 'vitest';
import { lockMatches } from './operator-address';

describe('lockMatches', () => {
  it('confirms a policy that names exactly the addresses that were set', () => {
    expect(lockMatches({ cidrs: ['203.0.113.7/32', '198.51.100.0/24'], open: false }, ['198.51.100.0/24', '203.0.113.7/32'])).toBe(true);
  });

  it('must not confirm a policy that still names an old address, misses a new one, or has a rule without its condition', () => {
    expect(lockMatches({ cidrs: ['203.0.113.7/32'], open: false }, ['198.51.100.9/32'])).toBe(false);
    expect(lockMatches({ cidrs: ['203.0.113.7/32'], open: false }, ['203.0.113.7/32', '198.51.100.9/32'])).toBe(false);
    expect(lockMatches({ cidrs: ['203.0.113.7/32', '198.51.100.9/32'], open: false }, ['203.0.113.7/32'])).toBe(false);
    expect(lockMatches({ cidrs: [], open: true }, ['203.0.113.7/32'])).toBe(false);
  });
});
