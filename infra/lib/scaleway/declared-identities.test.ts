import { describe, expect, it } from 'vitest';
import { sameRules } from './declared-identities';

describe('sameRules', () => {
  const wanted = [
    { permission_set_names: ['B', 'A'], project_ids: ['p'], condition: 'x' },
    { permission_set_names: ['C'], project_ids: ['p'] },
  ];

  it('takes rules in any order, sets in any order, and an absent condition as an empty one', () => {
    expect(
      sameRules(
        [
          { permission_set_names: ['C'], project_ids: ['p'], condition: '' },
          { permission_set_names: ['A', 'B'], project_ids: ['p'], condition: 'x', organization_id: null },
        ],
        wanted,
      ),
    ).toBe(true);
  });

  it('must not pass a rule that is missing, extra, or conditioned otherwise', () => {
    expect(sameRules([{ permission_set_names: ['A', 'B'], project_ids: ['p'], condition: 'x' }], wanted)).toBe(false);
    expect(sameRules([...wanted, { permission_set_names: ['D'], project_ids: ['p'] }], wanted)).toBe(false);
    expect(sameRules([{ ...wanted[0], condition: 'y' }, wanted[1]] as never, wanted)).toBe(false);
  });
});
