import {
  type AccessPolicies,
  createEntityHierarchy,
  createRoleRegistry,
  type EntityType,
  type PermissionTopology,
  type PermissionValue,
} from 'shared';
import { configureAccessPolicies } from 'shared/testing/policies';
import { describe, expect, it } from 'vitest';
import { deriveGrantBoundaryViews, type ViewMembership } from './views';

// Synthetic deep topology (projectcampus-shaped), same as the backend classifier tests:
// derived views must be exactly the ones resolveViewReadStatus can prove `ok`.
const ORG = 'org-1';
const roles = createRoleRegistry(['admin', 'member', 'staff', 'student', 'owner', 'follower'] as const);
const deepHierarchy = createEntityHierarchy(roles)
  .user()
  .channel('organization', { parent: null, roles: ['admin', 'member'] })
  .channel('course', { parent: 'organization', roles: ['staff', 'student'] })
  .channel('courseSection', { parent: 'course', roles: ['staff', 'student'] })
  .channel('project', { parent: 'courseSection', roles: ['owner', 'follower'] })
  .product('item', { parent: 'project', nullableAncestors: ['project', 'courseSection', 'course'] })
  .build();
const deepTopology: PermissionTopology = { hierarchy: deepHierarchy };

type ChannelType = 'organization' | 'course' | 'courseSection' | 'project';
const ENTITY_TYPES = ['user', 'organization', 'course', 'courseSection', 'project', 'item'] as const;
const CHANNEL_ROLES = {
  organization: ['admin', 'member'],
  course: ['staff', 'student'],
  courseSection: ['staff', 'student'],
  project: ['owner', 'follower'],
} as const satisfies Record<ChannelType, readonly string[]>;

const policies = (readValue: (channelType: ChannelType, role: string) => PermissionValue): AccessPolicies =>
  configureAccessPolicies(
    ENTITY_TYPES as unknown as readonly EntityType[],
    ({ subject, contexts }) => {
      if ((subject.name as string) !== 'item') return;
      const builders = contexts as unknown as Record<
        ChannelType,
        Record<string, (perms: { read: PermissionValue }) => void>
      >;
      for (const [channelType, channelRoles] of Object.entries(CHANNEL_ROLES) as [ChannelType, readonly string[]][]) {
        for (const role of channelRoles) builders[channelType][role]({ read: readValue(channelType, role) });
      }
    },
    deepTopology,
  );

const membership = (channelType: ChannelType, channelId: string, role: string): ViewMembership => ({
  organizationId: ORG,
  channelType,
  channelId,
  role,
});

const paths: Record<string, string> = {
  c1: `${ORG}/c1`,
  s1: `${ORG}/c1/s1`,
  p1: `${ORG}/c1/s1/p1`,
  p2: `${ORG}/c1/s1/p2`,
  p3: `${ORG}/c2/s9/p3`,
};

const derive = (
  memberships: ViewMembership[],
  read: (channelType: ChannelType, role: string) => PermissionValue,
  elevatedRoles?: readonly string[],
) =>
  deriveGrantBoundaryViews({
    memberships,
    entityTypes: ['item'],
    resolvePath: (_type, id) => paths[id] ?? null,
    policies: policies(read),
    topology: deepHierarchy,
    elevatedRoles,
  });

const ELEVATED = ['admin', 'staff'] as const;

describe('deriveGrantBoundaryViews', () => {
  it('org-wide subtree for elevated org roles; org SELF for home-scoped org roles', () => {
    const adminRead = (ct: ChannelType, role: string): PermissionValue =>
      ct === 'organization' && role === 'admin' ? 1 : 0;
    expect(derive([membership('organization', ORG, 'admin')], adminRead, ELEVATED)).toEqual([
      { key: `${ORG}:item:subtree`, organizationId: ORG, prefixes: [ORG], entityTypes: ['item'], depth: 'subtree' },
    ]);

    const memberRead = (ct: ChannelType, role: string): PermissionValue =>
      ct === 'organization' && role === 'member' ? 1 : 0;
    expect(derive([membership('organization', ORG, 'member')], memberRead, ELEVATED)).toEqual([
      { key: `${ORG}:item:self`, organizationId: ORG, prefixes: [ORG], entityTypes: ['item'], depth: 'self' },
    ]);
  });

  it('home-level grants merge into ONE prefix-set subtree view (the 3-of-5 aggregate)', () => {
    const ownerRead = (ct: ChannelType, role: string): PermissionValue =>
      ct === 'project' && role === 'owner' ? 1 : 0;
    const views = derive(
      [
        membership('project', 'p1', 'owner'),
        membership('project', 'p2', 'owner'),
        membership('project', 'p3', 'owner'),
      ],
      ownerRead,
      ELEVATED,
    );
    expect(views).toEqual([
      {
        key: `${ORG}:item:subtree`,
        organizationId: ORG,
        prefixes: [paths.p1, paths.p2, paths.p3].sort(),
        entityTypes: ['item'],
        depth: 'subtree',
      },
    ]);
  });

  it('elevated intermediate grants derive subtree views; non-elevated derive SELF views', () => {
    const staffRead = (ct: ChannelType, role: string): PermissionValue => (ct === 'course' && role === 'staff' ? 1 : 0);
    expect(derive([membership('course', 'c1', 'staff')], staffRead, ELEVATED)).toEqual([
      {
        key: `${ORG}:item:subtree`,
        organizationId: ORG,
        prefixes: [paths.c1],
        entityTypes: ['item'],
        depth: 'subtree',
      },
    ]);

    const studentRead = (ct: ChannelType, role: string): PermissionValue =>
      ct === 'course' && role === 'student' ? 1 : 0;
    expect(derive([membership('course', 'c1', 'student')], studentRead, ELEVATED)).toEqual([
      { key: `${ORG}:item:self`, organizationId: ORG, prefixes: [paths.c1], entityTypes: ['item'], depth: 'self' },
    ]);
  });

  it('without elevatedRoles every unconditional grant is subtree (engine parity)', () => {
    const studentRead = (ct: ChannelType, role: string): PermissionValue =>
      ct === 'course' && role === 'student' ? 1 : 0;
    expect(derive([membership('course', 'c1', 'student')], studentRead, undefined)).toEqual([
      {
        key: `${ORG}:item:subtree`,
        organizationId: ORG,
        prefixes: [paths.c1],
        entityTypes: ['item'],
        depth: 'subtree',
      },
    ]);
  });

  it('an org-wide subtree prefix subsumes narrower ones; conditional/unknown grants derive nothing', () => {
    const read = (ct: ChannelType, role: string): PermissionValue => {
      if (ct === 'organization' && role === 'admin') return 1;
      if (ct === 'project' && role === 'owner') return 1;
      if (ct === 'course' && role === 'student') return 'own';
      return 0;
    };
    const views = derive(
      [
        membership('organization', ORG, 'admin'),
        membership('project', 'p1', 'owner'),
        membership('course', 'c1', 'student'), // conditional → nothing
        membership('project', 'unknown-path', 'owner'), // unresolvable path → skipped
      ],
      read,
      ELEVATED,
    );
    expect(views).toEqual([
      { key: `${ORG}:item:subtree`, organizationId: ORG, prefixes: [ORG], entityTypes: ['item'], depth: 'subtree' },
    ]);
  });
});
