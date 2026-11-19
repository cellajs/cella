import { describe, expect, it, vi } from 'vitest';
import { placementContext } from '#/modules/lti-platform/helpers/context-channel';
import type { LtiResourceLinkModel } from '#/modules/lti-platform/lti-resource-links-db';

vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const { deepHierarchy } = await import('shared/testing/deep-fixture');
  return { ...actual, hierarchy: deepHierarchy, isChannel: deepHierarchy.isChannel, isProduct: deepHierarchy.isProduct };
});

// An app whose courses are LTI contexts, and whose sections, projects and organization are not.
vi.mock('#/modules/lti-platform/launch-context', () => ({
  ltiContextTypes: (channelType: string) => (channelType === 'course' ? ['CourseOffering'] : null),
}));

const ids = { organizationId: 'o1', courseId: 'c1', courseSectionId: 's1', projectId: 'p1' };

// A placement's id columns on the deep fixture's channels, which the template's own channel types do not name.
const placedIn = (channelType: string, channelId: string, columns: Record<string, string | null> = ids) =>
  ({ ...columns, channelType, channelId }) as unknown as LtiResourceLinkModel;

// Contract: in an app whose tab may sit below a course, the course is what a launch names and what the installation reads.
describe('placementContext', () => {
  it.each([
    ['a course', placedIn('course', 'c1'), { channelType: 'course', channelId: 'c1' }],
    ['a section below a course', placedIn('courseSection', 's1', { ...ids, projectId: null }), { channelType: 'course', channelId: 'c1' }],
    ['a project two levels below a course', placedIn('project', 'p1'), { channelType: 'course', channelId: 'c1' }],
  ])('names the course for a tab in %s', (_where, placement, course) => {
    expect(placementContext(placement)).toMatchObject(course);
  });

  it('names no course for a tab above every course', () => {
    expect(placementContext(placedIn('organization', 'o1', { organizationId: 'o1' }))).toBeNull();
  });
});
