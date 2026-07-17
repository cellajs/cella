import { describe, expect, it } from 'vitest';
import type { AuthContext } from '#/core/context';
import { getUnseenCountsOp } from './get-unseen-counts';

// Unseen counts are membership-grouped. The system-admin bypass widens rows within an
// organization but does not enroll the admin in every organization's tally.
describe('getUnseenCountsOp — membership-less system admin', () => {
  it('returns {} for a system admin with no memberships (grouped by membership, not by bypass)', async () => {
    const ctx = {
      var: { user: { id: 'u1' }, userId: 'u1', isSystemAdmin: true, memberships: [] },
    } as unknown as AuthContext;

    expect(await getUnseenCountsOp(ctx)).toEqual({});
  });
});
