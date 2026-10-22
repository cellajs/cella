import type { ChannelEntityType, EntityHierarchy, EntityType, PolicyMatrix, PredicateActor } from 'shared';
import { deepEntityTypes, deepHierarchy, deepOverrides } from 'shared/testing/deep-fixture';
import { configurePolicyMatrix } from 'shared/testing/policies';
import { describe, expect, it } from 'vitest';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import {
  type ChannelCollectionReadScope,
  draftChannelVisibleToForPolicies,
  resolveChannelCollectionReadScopeForPolicies,
} from '#/permissions/channel-collection-scope';

const orgId = 'org-1';

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
    organizationId: orgId,
    role,
  }) as unknown as MembershipBaseModel;

const actor: PredicateActor = { actorId: 'actor', isSystemAdmin: false, scopes: null };

const resolve = (memberships: MembershipBaseModel[], asActor: PredicateActor = actor): ChannelCollectionReadScope =>
  resolveChannelCollectionReadScopeForPolicies({
    policies,
    memberships,
    channelType: 'project' as Exclude<ChannelEntityType, 'organization'>,
    organizationId: orgId,
    actor: asActor,
    hierarchy: deepHierarchy as unknown as EntityHierarchy,
  });

describe('resolveChannelCollectionReadScope', () => {
  it('system admin resolves to unconditional org-wide', () => {
    const scope = resolve([], { actorId: 'admin', isSystemAdmin: true, scopes: null });
    expect(scope).toEqual({ orgWide: 'all', ancestorScopes: [] });
  });

  it('org-root grant with update sees everything; read-only sees published org-wide', () => {
    expect(resolve([membership('organization', orgId, 'admin')])).toEqual({ orgWide: 'all', ancestorScopes: [] });
    expect(resolve([membership('organization', orgId, 'member')])).toEqual({ orgWide: 'published', ancestorScopes: [] });
  });

  it('ancestor-level grants split managed (drafts visible) from published-only ids', () => {
    const scope = resolve([membership('course', 'course-1', 'staff'), membership('courseSection', 'section-1', 'student')]);
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

describe('draftChannelVisibleTo', () => {
  const project = (publishedAt: string | null) => ({
    id: 'project-1',
    publishedAt,
    organizationId: orgId,
    courseId: 'course-1',
    courseSectionId: 'section-1',
  });

  const shows = (memberships: MembershipBaseModel[], publishedAt: string | null = null, asActor: PredicateActor = actor) =>
    draftChannelVisibleToForPolicies({
      policies,
      memberships,
      channelType: 'project' as ChannelEntityType,
      channel: project(publishedAt),
      actor: asActor,
      hierarchy: deepHierarchy as unknown as EntityHierarchy,
    });

  it('shows a published channel whatever the grant: the read check is the caller', () => {
    expect(shows([], '2026-01-01T00:00:00.000Z')).toBe(true);
  });

  it('shows a draft to a member of the channel itself, in any role', () => {
    expect(shows([membership('project', 'project-1', 'member')])).toBe(true);
    expect(shows([membership('project', 'project-2', 'owner')])).toBe(false);
  });

  it('shows a draft to a grant above it that also holds update on the type, and to no read-only grant', () => {
    expect(shows([membership('organization', orgId, 'admin')])).toBe(true);
    expect(shows([membership('course', 'course-1', 'staff')])).toBe(true);
    expect(shows([membership('course', 'course-2', 'staff')])).toBe(false);
    expect(shows([membership('organization', orgId, 'member')])).toBe(false);
    expect(shows([membership('courseSection', 'section-1', 'student')])).toBe(false);
  });

  it('shows a draft to a system admin and to no one without a grant', () => {
    expect(shows([], null, { actorId: 'admin', isSystemAdmin: true, scopes: null })).toBe(true);
    expect(shows([])).toBe(false);
    expect(shows([], null, { anonymous: true })).toBe(false);
  });

  it('shows a draft organization to its own members alone', () => {
    const organization = { id: orgId, publishedAt: null };
    const showsOrganization = (memberships: MembershipBaseModel[]) =>
      draftChannelVisibleToForPolicies({ policies, memberships, channelType: 'organization', channel: organization, actor });
    expect(showsOrganization([membership('organization', orgId, 'member')])).toBe(true);
    expect(showsOrganization([membership('organization', 'org-2', 'admin')])).toBe(false);
  });
});
