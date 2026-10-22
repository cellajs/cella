import type { PolicyCellInput } from 'shared';
import { type DeepChannelType as ChannelType, deepHierarchy, deepReadPolicies as policies } from 'shared/testing/deep-fixture';
import { elevateAcross } from 'shared/testing/elevate';
import { describe, expect, it } from 'vitest';
import { deriveGrantBoundaryViews, type ViewMembership } from './views';

// Shared deep fixture, same hierarchy as the backend classifier tests: derived views
// must be exactly the ones resolveViewReadStatus can prove `ok`.
const ORG = 'org-1';

const membership = (channelType: ChannelType, channelId: string, role: string): ViewMembership => ({
  organizationId: ORG,
  channelType,
  channelId,
  role,
});

const paths: Record<string, string> = { c1: `${ORG}/c1`, s1: `${ORG}/c1/s1`, p1: `${ORG}/c1/s1/p1`, p2: `${ORG}/c1/s1/p2`, p3: `${ORG}/c2/s9/p3` };

const derive = (
  memberships: ViewMembership[],
  read: (channelType: ChannelType, role: string) => PolicyCellInput,
  elevatedGrants?: ReadonlySet<string>,
) =>
  deriveGrantBoundaryViews({
    memberships,
    entityTypes: ['item'],
    resolvePath: (_type, id) => paths[id] ?? null,
    policies: policies(read),
    hierarchy: deepHierarchy,
    elevatedGrants,
  });

const ELEVATED = elevateAcross(deepHierarchy, ['admin', 'staff']);

describe('deriveGrantBoundaryViews', () => {
  it.each([
    ['organization', 'admin', 'subtree', ORG, ORG],
    ['organization', 'member', 'self', ORG, ORG],
    ['course', 'staff', 'subtree', 'c1', paths.c1],
    ['course', 'student', 'self', 'c1', paths.c1],
  ] as const)(
    'a readable %s grant as %s derives a %s view: an elevated grant reads its subtree, any other its own channel',
    (channelType, role, depth, channelId, prefix) => {
      const read = (ct: ChannelType, r: string): PolicyCellInput => (ct === channelType && r === role ? 1 : 0);
      expect(derive([membership(channelType, channelId, role)], read, ELEVATED)).toEqual([
        { key: `${ORG}:item:${depth}`, organizationId: ORG, prefixes: [prefix], entityTypes: ['item'], depth },
      ]);
    },
  );

  it('home-level grants merge into ONE prefix-set subtree view (the 3-of-5 aggregate)', () => {
    const ownerRead = (ct: ChannelType, role: string): PolicyCellInput => (ct === 'project' && role === 'owner' ? 1 : 0);
    const views = derive(
      [membership('project', 'p1', 'owner'), membership('project', 'p2', 'owner'), membership('project', 'p3', 'owner')],
      ownerRead,
      ELEVATED,
    );
    expect(views).toEqual([
      { key: `${ORG}:item:subtree`, organizationId: ORG, prefixes: [paths.p1, paths.p2, paths.p3].sort(), entityTypes: ['item'], depth: 'subtree' },
    ]);
  });

  it('an org-wide subtree prefix subsumes narrower ones; conditional/unknown grants derive nothing', () => {
    const read = (ct: ChannelType, role: string): PolicyCellInput => {
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
    expect(views).toEqual([{ key: `${ORG}:item:subtree`, organizationId: ORG, prefixes: [ORG], entityTypes: ['item'], depth: 'subtree' }]);
  });
});
