import type { ChannelEntityType, EntityType, SubjectForPermission } from 'shared';
import { describe, expect, it, vi } from 'vitest';
import type { ActorBinding } from '#/core/context';
import { lisContextRoles, lisContextTypes, lisInstitutionRoles } from '#/lib/lti-vocabulary';
import { holdsLtiTabs, linkContext, ltiTabTypeRefusal } from '#/modules/lti-platform/helpers/context-channel';
import { ltiLaunchRoles } from '#/modules/lti-platform/helpers/lti-roles';
import { opensFor } from '#/modules/lti-platform/helpers/tab-audience';

// The permission engine on the nested fixture: courses, sections and projects below the organization, where power from
// above reaches a channel a person may hold a membership in. Admins, staff and owners may update their channel and those
// below, members, students and followers only read.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const { deepEntityTypes, deepHierarchy, deepOverrides } = await import('shared/testing/deep-fixture');
  const { configurePolicyMatrix } = await import('shared/testing/policies');
  const editors = new Set(['admin', 'staff', 'owner']);
  // The matrix builder is typed by the app's entities and roles; the deep fixture's are cast, as its other suites do.
  const policies = configurePolicyMatrix(
    deepEntityTypes as unknown as readonly EntityType[],
    ({ entityType, channels }) => {
      if (!['organization', 'course', 'courseSection', 'project'].includes(entityType)) return;
      const builders = channels as unknown as Record<string, Record<string, (cells: Record<string, 0 | 1>) => void>>;
      for (const roles of Object.values(builders))
        for (const [role, build] of Object.entries(roles)) build({ read: 1, update: editors.has(role) ? 1 : 0 });
    },
    deepOverrides,
  );
  const idColumns: Record<string, string> = { organization: 'organizationId', course: 'courseId', courseSection: 'courseSectionId' };
  return {
    ...actual,
    hierarchy: deepHierarchy,
    isChannel: deepHierarchy.isChannel,
    isProduct: deepHierarchy.isProduct,
    buildSubjectFromEntity: (entityType: string, entity: Record<string, unknown> & { id: string }) => ({
      entityType,
      id: entity.id,
      channelIds: Object.fromEntries(
        deepHierarchy.getOrderedAncestors(entityType).map((ancestor) => [ancestor, entity[idColumns[ancestor]] ?? null]),
      ),
    }),
    checkAccess: (access: { memberships: ActorBinding[]; actorId: string }, action: 'read' | 'update', subject: SubjectForPermission) => {
      const { can, membership } = actual.getAllDecisions(policies, access.memberships, subject, {
        hierarchy: deepHierarchy,
        actorId: access.actorId,
      });
      return { allowed: can[action], membership };
    },
  };
});

// An app whose courses and projects are LTI contexts, and whose course sections are not.
vi.mock('#/modules/lti-platform/launch-context', async (importOriginal) => {
  const template = (await import('./lti-template-answers')).templateLaunchContext(await importOriginal());
  return { ...template, ltiContextTypes: (channelType: string) => (channelType === 'courseSection' ? null : [lisContextTypes.group]) };
});

// The deep fixture's channel types are not the app's: cast as its other suites do.
const course = 'course' as ChannelEntityType;
const courseSection = 'courseSection' as ChannelEntityType;
const ids = { organizationId: 'o1', courseId: 'c1' };
const membership = (channelType: string, channelId: string, role: string) =>
  ({ channelType, channelId, organizationId: ids.organizationId, role }) as unknown as ActorBinding;
const organizationAdmin = membership('organization', ids.organizationId, 'admin');
const courseStudent = membership('course', ids.courseId, 'student');
const courseTab = (audience: 'members' | 'editors') => ({
  channelType: course,
  channelId: ids.courseId,
  organizationId: ids.organizationId,
  audience,
});
const courseRow = { id: ids.courseId, organizationId: ids.organizationId };

describe('LTI roles and audiences on a nested hierarchy', () => {
  // Attack: an organization admin enrolled as a course's student goes there as a student on a tab for its members.
  // Judged by all they hold, as before this rule, they would go as Instructor.
  it('sends a member the context roles of their own membership on a tab for its members, whatever power reaches them from above', () => {
    const person = { personId: 'p1', memberships: [organizationAdmin, courseStudent] };
    expect(opensFor('members', person, course, courseRow)).toBe(true);
    expect(ltiLaunchRoles({ ...person, link: courseTab('members'), channel: courseRow })).toEqual([
      lisContextRoles.learner,
      lisInstitutionRoles.administrator,
    ]);
  });

  // Attack and contract: an admin without a membership in the course is no member of it, and a tab for its editors lets
  // them in as what they may do there: an Instructor in the template's answer. A student is no editor.
  it('lets an admin without a membership in by a tab for its editors alone, as what they may do there', () => {
    const admin = { personId: 'p2', memberships: [organizationAdmin] };
    expect(opensFor('members', admin, course, courseRow)).toBe(false);
    expect(opensFor('editors', admin, course, courseRow)).toBe(true);
    expect(ltiLaunchRoles({ ...admin, link: courseTab('editors'), channel: courseRow })).toEqual([
      lisContextRoles.instructor,
      lisInstitutionRoles.administrator,
    ]);
    expect(opensFor('editors', { personId: 'p3', memberships: [courseStudent] }, course, courseRow)).toBe(false);
  });

  // Attack: a channel type below an LTI context that is no context holds no LTI tabs, whatever an admin allowed.
  it('holds no LTI tabs in a channel type that is no context below one that is', () => {
    expect(holdsLtiTabs(course)).toBe(true);
    expect(holdsLtiTabs(courseSection)).toBe(false);
    expect(linkContext({ channelType: courseSection, channelId: 's1' })).toBeNull();
    expect(ltiTabTypeRefusal({ channelTypes: [course, courseSection] }, courseSection)).toBe('lti_channel_type_holds_no_tabs');
  });
});
