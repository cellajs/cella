import {
  type AccessPolicies,
  createEntityHierarchy,
  createRoleRegistry,
  type EntityType,
  type PermissionTopology,
  type PermissionValue,
  type ProductEntityType,
} from 'shared';
import { configureAccessPolicies } from 'shared/testing/policies';
import { describe, expect, it } from 'vitest';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { resolveViewReadStatusForPolicies } from './view-read-status';

/**
 * Catchup prefix authorization (`resolveViewReadStatus`): `ok` requires PROOF of
 * unconditional subtree read on the prefix's deepest node; readable-but-unproven is
 * `opaque` (no summaries returned); no read route is `forbidden`. Same synthetic
 * deep topology as the row-predicates parity suite.
 */

const ROOT_ID = 'org-1';

const deepRoles = createRoleRegistry(['admin', 'member', 'staff', 'student', 'owner', 'follower'] as const);
const deepHierarchy = createEntityHierarchy(deepRoles)
  .user()
  .channel('organization', { parent: null, roles: ['admin', 'member'] })
  .channel('course', { parent: 'organization', roles: ['staff', 'student'] })
  .channel('courseSection', { parent: 'course', roles: ['staff', 'student'] })
  .channel('project', { parent: 'courseSection', roles: ['owner', 'follower'] })
  .product('item', { parent: 'project', nullableAncestors: ['project', 'courseSection', 'course'] })
  .build();
const deepTopology: PermissionTopology = { hierarchy: deepHierarchy };

type DeepChannelType = 'organization' | 'course' | 'courseSection' | 'project';
const DEEP_ENTITY_TYPES = ['user', 'organization', 'course', 'courseSection', 'project', 'item'] as const;
const DEEP_CHANNEL_ROLES = {
  organization: ['admin', 'member'],
  course: ['staff', 'student'],
  courseSection: ['staff', 'student'],
  project: ['owner', 'follower'],
} as const satisfies Record<DeepChannelType, readonly string[]>;
const ITEM = 'item' as unknown as ProductEntityType;

const policies = (readValue: (channelType: DeepChannelType, role: string) => PermissionValue): AccessPolicies =>
  configureAccessPolicies(
    DEEP_ENTITY_TYPES as unknown as readonly EntityType[],
    ({ subject, contexts }) => {
      if ((subject.name as string) !== 'item') return;
      const builders = contexts as unknown as Record<
        DeepChannelType,
        Record<string, (perms: { read: PermissionValue }) => void>
      >;
      for (const [channelType, roles] of Object.entries(DEEP_CHANNEL_ROLES) as [DeepChannelType, readonly string[]][]) {
        for (const role of roles) builders[channelType][role]({ read: readValue(channelType, role) });
      }
    },
    deepTopology,
  );

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
    read?: (channelType: DeepChannelType, role: string) => PermissionValue;
    memberships?: MembershipBaseModel[];
    isSystemAdmin?: boolean;
  } = {},
) =>
  resolveViewReadStatusForPolicies(
    {
      policies: policies(opts.read ?? (() => 0)),
      memberships: opts.memberships ?? [],
      entityType: ITEM,
      organizationId: ROOT_ID,
      actor: { userId: 'actor', isSystemAdmin: opts.isSystemAdmin ?? false },
      topology: deepTopology,
    },
    prefix,
  );

describe('resolveViewReadStatus', () => {
  const orgAdminRead = (ct: DeepChannelType, role: string): PermissionValue =>
    ct === 'organization' && role === 'admin' ? 1 : 0;
  const courseStaffRead = (ct: DeepChannelType, role: string): PermissionValue =>
    ct === 'course' && role === 'staff' ? 1 : 0;
  const projectOwnerRead = (ct: DeepChannelType, role: string): PermissionValue =>
    ct === 'project' && role === 'owner' ? 1 : 0;
  const orgMemberOwnRead = (ct: DeepChannelType, role: string): PermissionValue =>
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
    // client-supplied — node-id-only proof keeps forged ancestry out (conservative opaque).
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

  it('no read route at all is forbidden, as is a prefix outside the org', () => {
    expect(statusFor(`${ROOT_ID}/c1`, {})).toBe('forbidden');
    expect(
      statusFor('other-org/c1', { read: orgAdminRead, memberships: [membership('organization', ROOT_ID, 'admin')] }),
    ).toBe('forbidden');
    expect(statusFor('', {})).toBe('forbidden');
  });
});
