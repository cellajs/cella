import type { PolicyCellInput, ProductEntityType } from 'shared';
import { type DeepChannelType, deepOverrides, deepReadPolicies as policies } from 'shared/testing/deep-fixture';
import { describe, expect, it } from 'vitest';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { resolveViewReadStatusForPolicies } from './view-read-status';

/**
 * Catchup prefix authorization (`resolveViewReadStatus`): `ok` requires PROOF of
 * unconditional subtree read on the prefix's deepest node; readable-but-unproven is
 * `opaque` (no summaries returned); no read route is `forbidden`. Uses the shared
 * deep fixture, same hierarchy as the row-predicates parity suite.
 */
const ROOT_ID = 'org-1';

const ITEM = 'item' as unknown as ProductEntityType;

const membership = (channelType: DeepChannelType, channelId: string, role: string): MembershipBaseModel =>
  ({
    id: `mem-${channelType}-${channelId}-${role}`,
    userId: 'actor',
    channelType,
    channelId,
    organizationId: ROOT_ID,
    role,
  }) as unknown as MembershipBaseModel;

const statusFor = (
  prefix: string,
  opts: {
    read?: (channelType: DeepChannelType, role: string) => PolicyCellInput;
    memberships?: MembershipBaseModel[];
    isSystemAdmin?: boolean;
    elevatedRoles?: readonly string[];
    depth?: 'self' | 'subtree';
    truePath?: string | null;
  } = {},
) =>
  resolveViewReadStatusForPolicies(
    {
      policies: policies(opts.read ?? (() => 0)),
      memberships: opts.memberships ?? [],
      entityType: ITEM,
      organizationId: ROOT_ID,
      actor: { userId: 'actor', isSystemAdmin: opts.isSystemAdmin ?? false },
      elevatedRoles: opts.elevatedRoles,
      ...deepOverrides,
    },
    prefix,
    opts.depth,
    opts.truePath,
  );

describe('resolveViewReadStatus', () => {
  const orgAdminRead = (ct: DeepChannelType, role: string): PolicyCellInput =>
    ct === 'organization' && role === 'admin' ? 1 : 0;
  const courseStaffRead = (ct: DeepChannelType, role: string): PolicyCellInput =>
    ct === 'course' && role === 'staff' ? 1 : 0;
  const projectOwnerRead = (ct: DeepChannelType, role: string): PolicyCellInput =>
    ct === 'project' && role === 'owner' ? 1 : 0;
  const orgMemberOwnRead = (ct: DeepChannelType, role: string): PolicyCellInput =>
    ct === 'organization' && role === 'member' ? 'own' : 0;

  it('org-wide unconditional read answers every prefix in the org', () => {
    const opts = { read: orgAdminRead, memberships: [membership('organization', ROOT_ID, 'admin')] };
    expect(statusFor(ROOT_ID, opts)).toBe('ok');
    expect(statusFor(`${ROOT_ID}/c1`, opts)).toBe('ok');
    expect(statusFor(`${ROOT_ID}/c1/s1/p1`, opts)).toBe('ok');
  });

  it('sysadmin is ok everywhere inside the org, forbidden outside it', () => {
    expect(statusFor(`${ROOT_ID}/c1`, { isSystemAdmin: true })).toBe('ok');
    expect(statusFor('other-org/c1', { isSystemAdmin: true })).toBe('forbidden');
  });

  it('an intermediate-level grant answers its OWN node, is opaque above and below', () => {
    const opts = { read: courseStaffRead, memberships: [membership('course', 'c1', 'staff')] };
    // The granted course node itself: proof of subtree coverage.
    expect(statusFor(`${ROOT_ID}/c1`, opts)).toBe('ok');
    // Org level: staff can read some org rows, not provably all → no summaries.
    expect(statusFor(ROOT_ID, opts)).toBe('opaque');
    // Deeper node under the granted course: covered in truth, but the prefix is
    // client-supplied, so node-id-only proof keeps forged ancestry out (conservative opaque).
    expect(statusFor(`${ROOT_ID}/c1/s1/p1`, opts)).toBe('opaque');
    // A different course: readable-nothing there, but SOME org scope exists → opaque.
    expect(statusFor(`${ROOT_ID}/c2`, opts)).toBe('opaque');
  });

  it('a home-level (deepest) grant answers its own node', () => {
    const opts = { read: projectOwnerRead, memberships: [membership('project', 'p1', 'owner')] };
    expect(statusFor(`${ROOT_ID}/c1/s1/p1`, opts)).toBe('ok');
    expect(statusFor(`${ROOT_ID}/c1`, opts)).toBe('opaque');
  });

  it('conditional-only readers (read: own) are opaque everywhere in the org', () => {
    const opts = { read: orgMemberOwnRead, memberships: [membership('organization', ROOT_ID, 'member')] };
    expect(statusFor(ROOT_ID, opts)).toBe('opaque');
    expect(statusFor(`${ROOT_ID}/c1`, opts)).toBe('opaque');
  });

  it('SELF views: a home-scoped grant (non-elevated under elevatedRoles) answers its own node', () => {
    // Course student read=1 with elevatedRoles configured: the grant is home-scoped.
    // It covers exactly the course wall (rows homed at c1), which is what a self view asks.
    const courseStudentRead = (ct: DeepChannelType, role: string): PolicyCellInput =>
      ct === 'course' && role === 'student' ? 1 : 0;
    const opts = {
      read: courseStudentRead,
      memberships: [membership('course', 'c1', 'student')],
      elevatedRoles: ['admin', 'staff'] as const,
    };

    // Self view on the granted node: provable because homed rows are exactly the grant.
    expect(statusFor(`${ROOT_ID}/c1`, { ...opts, depth: 'self' })).toBe('ok');
    // Subtree view on the same node: NOT provable (other projects live below).
    expect(statusFor(`${ROOT_ID}/c1`, { ...opts, depth: 'subtree' })).toBe('opaque');
    // Self view on a different course: no grant there.
    expect(statusFor(`${ROOT_ID}/c2`, { ...opts, depth: 'self' })).toBe('opaque');
  });

  it('SELF views: subtree-scoped proofs still apply (self ⊂ subtree)', () => {
    const opts = {
      read: courseStaffRead,
      memberships: [membership('course', 'c1', 'staff')],
      elevatedRoles: ['admin', 'staff'] as const,
    };
    expect(statusFor(`${ROOT_ID}/c1`, { ...opts, depth: 'self' })).toBe('ok');
  });

  it('VERIFIED ancestry: an ancestor grant proves deeper nodes when the path is true', () => {
    const opts = { read: courseStaffRead, memberships: [membership('course', 'c1', 'staff')] };
    const deep = `${ROOT_ID}/c1/s1/p1`;

    // The flipped cell: staff's course grant + verified true path → deep node ok.
    expect(statusFor(deep, { ...opts, truePath: deep })).toBe('ok');
    // Unverified (no counters row): node-id-only proof stays conservative.
    expect(statusFor(deep, { ...opts, truePath: null })).toBe('opaque');
    // Forged ancestry: the node's true path hangs elsewhere → opaque, self-heals.
    expect(statusFor(deep, { ...opts, truePath: `${ROOT_ID}/c2/s9/p1` })).toBe('opaque');
    // Verified path under a DIFFERENT course: no grant on any true ancestor → opaque.
    const otherDeep = `${ROOT_ID}/c2/s9/p9`;
    expect(statusFor(otherDeep, { ...opts, truePath: otherDeep })).toBe('opaque');
  });

  it('VERIFIED ancestry: a mismatch blocks even org-wide readers (cross-org forge guard)', () => {
    const opts = { read: orgAdminRead, memberships: [membership('organization', ROOT_ID, 'admin')] };
    // Claim inside this org, but the node truly lives in another org.
    expect(statusFor(`${ROOT_ID}/c1`, { ...opts, truePath: 'other-org/c1' })).toBe('opaque');
    // Truthful claim: ok as before.
    expect(statusFor(`${ROOT_ID}/c1`, { ...opts, truePath: `${ROOT_ID}/c1` })).toBe('ok');
  });

  it('VERIFIED ancestry: ancestor HOME-grants still never prove deeper self views', () => {
    const courseStudentRead = (ct: DeepChannelType, role: string): PolicyCellInput =>
      ct === 'course' && role === 'student' ? 1 : 0;
    const opts = {
      read: courseStudentRead,
      memberships: [membership('course', 'c1', 'student')],
      elevatedRoles: ['admin', 'staff'] as const,
    };
    const deep = `${ROOT_ID}/c1/s1/p1`;
    // The student's course home-grant covers the course WALL, not project walls below.
    expect(statusFor(deep, { ...opts, depth: 'self', truePath: deep })).toBe('opaque');
  });

  it('no read route at all is forbidden, as is a prefix outside the org', () => {
    expect(statusFor(`${ROOT_ID}/c1`, {})).toBe('forbidden');
    expect(
      statusFor('other-org/c1', { read: orgAdminRead, memberships: [membership('organization', ROOT_ID, 'admin')] }),
    ).toBe('forbidden');
    expect(statusFor('', {})).toBe('forbidden');
  });
});
