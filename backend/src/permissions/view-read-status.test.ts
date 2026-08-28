import type { PolicyCellInput, ProductEntityType } from 'shared';
import {
  type DeepChannelType,
  deepHierarchy,
  deepOverrides,
  deepReadPolicies as policies,
} from 'shared/testing/deep-fixture';
import { elevateAcross } from 'shared/testing/elevate';
import { describe, expect, it } from 'vitest';

const DEEP_ELEVATED = elevateAcross(deepHierarchy, ['admin', 'staff']);

import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { resolveViewReadStatusForPolicies } from './view-read-status';

/**
 * Catchup prefix authorization: `ok` requires PROOF of unconditional subtree read on the prefix's
 * deepest node, readable-but-unproven is `opaque` (no summaries), no read route is `forbidden`.
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
    elevatedGrants?: ReadonlySet<string>;
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
      elevatedGrants: opts.elevatedGrants,
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
    // Deeper node under the granted course: covered in truth, but the prefix is client-supplied, so proof stops at the node id.
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

  it('SELF views: a home-scoped grant (non-elevated under elevatedGrants) answers its own node', () => {
    // Course student read=1 with elevatedGrants configured: the home-scoped grant covers exactly the course wall (rows homed at c1).
    const courseStudentRead = (ct: DeepChannelType, role: string): PolicyCellInput =>
      ct === 'course' && role === 'student' ? 1 : 0;
    const opts = {
      read: courseStudentRead,
      memberships: [membership('course', 'c1', 'student')],
      elevatedGrants: DEEP_ELEVATED,
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
      elevatedGrants: DEEP_ELEVATED,
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
    expect(statusFor(`${ROOT_ID}/c1`, { ...opts, truePath: `${ROOT_ID}/c1` })).toBe('ok');
  });

  it('VERIFIED ancestry: ancestor HOME-grants still never prove deeper self views', () => {
    const courseStudentRead = (ct: DeepChannelType, role: string): PolicyCellInput =>
      ct === 'course' && role === 'student' ? 1 : 0;
    const opts = {
      read: courseStudentRead,
      memberships: [membership('course', 'c1', 'student')],
      elevatedGrants: DEEP_ELEVATED,
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
