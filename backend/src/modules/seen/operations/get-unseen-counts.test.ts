import { describe, expect, it } from 'vitest';
import type { AuthContext } from '#/core/context';
import { getUnseenCountsOp } from './get-unseen-counts';

/**
 * Regression guard for a DELIBERATE asymmetry, not a bug.
 *
 * Unseen counts are grouped by the caller's channel memberships. A system admin with no
 * memberships therefore gets `{}` — even though the system-admin bypass makes them able to *read*
 * every row. That is correct: the bypass widens rows WITHIN an org, it does not enrol the admin in
 * every org's unseen tally (firing badges for every org in the system would be worse than useless).
 *
 * This is the one place a system admin does NOT "see everything," so it reads like an inconsistency
 * someone might later "fix" for uniformity. This test exists to make that a conscious choice: if you
 * change it, you are changing intended behavior, not correcting an oversight.
 */
describe('getUnseenCountsOp — membership-less system admin', () => {
  it('returns {} for a system admin with no memberships (grouped by membership, not by bypass)', async () => {
    const ctx = {
      var: { user: { id: 'u1' }, userId: 'u1', isSystemAdmin: true, memberships: [] },
    } as unknown as AuthContext;

    expect(await getUnseenCountsOp(ctx)).toEqual({});
  });
});
