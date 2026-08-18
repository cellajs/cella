import type { Actor, ChannelEntityType, EntityHierarchy, EntityType, PolicyMatrix } from 'shared';
import { deepEntityTypes, deepHierarchy, deepOverrides } from 'shared/testing/deep-fixture';
import { configurePolicyMatrix } from 'shared/testing/policies';
import { describe, expect, it } from 'vitest';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import {
  type ChannelCollectionReadScope,
  resolveChannelCollectionReadScopeForPolicies,
} from '#/permissions/channel-collection-scope';

const ORG_ID = 'org-1';

// Deep synthetic hierarchy: `project` read grants at three ancestor levels, with and without `update` (the draft-visibility split).
const policies: PolicyMatrix = configurePolicyMatrix(
  deepEntityTypes as unknown as readonly EntityType[],
  ({ entityType, channels }) => {
    if ((entityType as string) !== 'project') return;
    const builders = channels as unknown as Record<string, Record<string, (perms: Record<string, 0 | 1>) => void>>;
    builders.organization.admin({ read: 1, update: 1 });
    builders.organization.member({ read: 1 });
    builders.course.staff({ read: 1, update: 1 });
    builders.courseSection.student({ read: 1 });
  },
  deepOverrides,
);

const membership = (channelType: string, channelId: string, role: string): MembershipBaseModel =>
  ({
    id: `mem-${channelType}-${channelId}-${role}`,
    userId: 'actor',
    channelType,
    channelId,
    organizationId: ORG_ID,
    role,
  }) as unknown as MembershipBaseModel;

const actor: Actor = { userId: 'actor', isSystemAdmin: false };

const resolve = (memberships: MembershipBaseModel[], asActor: Actor = actor): ChannelCollectionReadScope =>
  resolveChannelCollectionReadScopeForPolicies({
    policies,
    memberships,
    channelType: 'project' as Exclude<ChannelEntityType, 'organization'>,
    organizationId: ORG_ID,
    actor: asActor,
    hierarchy: deepHierarchy as unknown as EntityHierarchy,
  });

describe('resolveChannelCollectionReadScope', () => {
  it('system admin resolves to unconditional org-wide', () => {
    const scope = resolve([], { userId: 'admin', isSystemAdmin: true });
    expect(scope).toEqual({ orgWide: 'all', ancestorScopes: [] });
  });

  it('org-root grant with update sees everything; read-only sees published org-wide', () => {
    expect(resolve([membership('organization', ORG_ID, 'admin')])).toEqual({ orgWide: 'all', ancestorScopes: [] });
    expect(resolve([membership('organization', ORG_ID, 'member')])).toEqual({
      orgWide: 'published',
      ancestorScopes: [],
    });
  });

  it('ancestor-level grants split managed (drafts visible) from published-only ids', () => {
    const scope = resolve([
      membership('course', 'course-1', 'staff'),
      membership('courseSection', 'section-1', 'student'),
    ]);
    expect(scope.orgWide).toBeNull();
    expect(scope.ancestorScopes).toEqual([
      { channelType: 'course', managedIds: ['course-1'], publishedIds: [] },
      { channelType: 'courseSection', managedIds: [], publishedIds: ['section-1'] },
    ]);
  });

  it('ignores grants from other orgs, non-ancestor levels, and roles without read', () => {
    const otherOrg = { ...membership('course', 'course-9', 'staff'), organizationId: 'org-2' } as MembershipBaseModel;
    const scope = resolve([
      otherOrg,
      // student holds no project read at course level in this matrix
      membership('course', 'course-1', 'student'),
      // project-level rows are own-type memberships; the list membership join carries those
      membership('project', 'project-1', 'owner'),
    ]);
    expect(scope).toEqual({ orgWide: null, ancestorScopes: [] });
  });

  it('managed ids subsume the published-only slice for the same id', () => {
    const scope = resolve([membership('course', 'course-1', 'staff'), membership('course', 'course-1', 'student')]);
    expect(scope.ancestorScopes).toEqual([{ channelType: 'course', managedIds: ['course-1'], publishedIds: [] }]);
  });
});
