import { createEntityHierarchy, type EntityHierarchy, type PolicyCellInput, type ProductEntityType } from 'shared';
import {
  type DeepChannelType,
  deepChannelRoles,
  deepElevatedHierarchy,
  deepRoles,
  deepSubtreeHierarchy,
  deepReadPolicies as policies,
} from 'shared/testing/deep-fixture';
import { describe, expect, it } from 'vitest';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { actorMembership } from './tests/actor-membership';
import { resolveViewReadStatus } from './view-read-status';

/**
 * Catchup authorization of an organization view: `ok` requires PROOF of unconditional read of every row of the type in
 * the organization, readable-but-unproven is `opaque` (no frontier), no read route is `forbidden`.
 */
const rootId = 'org-1';

const item = 'item' as unknown as ProductEntityType;

const membership = (channelType: DeepChannelType, channelId: string, role: string) => actorMembership(channelType, channelId, role, rootId);

interface StatusOpts {
  read?: (channelType: DeepChannelType, role: string) => PolicyCellInput;
  memberships?: MembershipBaseModel[];
  isSystemAdmin?: boolean;
  hierarchy?: EntityHierarchy;
}

/** Every role is elevated unless a case passes the hierarchy it needs. */
const statusFor = (opts: StatusOpts) => {
  const hierarchy = opts.hierarchy ?? deepSubtreeHierarchy;
  return resolveViewReadStatus(
    { actorId: 'actor', isSystemAdmin: opts.isSystemAdmin ?? false, memberships: opts.memberships ?? [], scopes: null },
    item,
    rootId,
    { policies: policies(opts.read ?? (() => 0), { hierarchy }), publicGrants: {}, hierarchy },
  );
};

/** A read policy with one granting cell. */
const only =
  (channelType: DeepChannelType, role: string, cell: PolicyCellInput = 1) =>
  (ct: DeepChannelType, r: string): PolicyCellInput =>
    ct === channelType && r === role ? cell : 0;

describe('resolveViewReadStatus', () => {
  it.each<[string, string, StatusOpts]>([
    ['an org-wide unconditional read', 'ok', { read: only('organization', 'admin'), memberships: [membership('organization', rootId, 'admin')] }],
    ['a system admin without a membership', 'ok', { isSystemAdmin: true }],
    [
      'an elevated grant on a course',
      'opaque',
      { read: only('course', 'staff'), memberships: [membership('course', 'c1', 'staff')], hierarchy: deepElevatedHierarchy },
    ],
    ['a grant on a project', 'opaque', { read: only('project', 'owner'), memberships: [membership('project', 'p1', 'owner')] }],
    [
      'an organization grant that reaches only the rows homed at the organization',
      'opaque',
      { read: only('organization', 'member'), memberships: [membership('organization', rootId, 'member')], hierarchy: deepElevatedHierarchy },
    ],
    ['a conditional read', 'opaque', { read: only('organization', 'member', 'own'), memberships: [membership('organization', rootId, 'member')] }],
    ['no read route', 'forbidden', {}],
  ])('%s answers %s', (_name, expected, opts) => {
    expect(statusFor(opts)).toBe(expected);
  });

  it("a non-elevated grant at the product's parent answers the organization", () => {
    const flatHierarchy = createEntityHierarchy(deepRoles)
      .user()
      .organization({ roles: deepChannelRoles.organization, elevated: ['admin'] })
      .product('item', { parent: 'organization' })
      .build();
    const opts = { read: only('organization', 'member'), memberships: [membership('organization', rootId, 'member')], hierarchy: flatHierarchy };
    expect(statusFor(opts)).toBe('ok');
  });
});
