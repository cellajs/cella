import { describe, expect, it } from 'vitest';
import type { EntityActionType } from '../../types.ts';
import { type DeepChannelType, deepOverrides } from '../testing/deep-fixture.ts';
import { archiveVeto } from './archive-veto.ts';
import type { SubjectForPermission } from './engine/types.ts';

type Ids = Partial<Record<DeepChannelType, string | null>>;

// The deep vocabulary is typed independently of the app config, so a subject is cast to the app's shape.
const subject = (entityType: string, channelIds: Ids, row?: Record<string, unknown>): SubjectForPermission =>
  ({ entityType, id: `${entityType}-subject`, channelIds, ...(row && { row }) }) as unknown as SubjectForPermission;

const archivedIds = new Set(['course-archived', 'section-archived', 'project-archived']);

const org = { organization: 'org' };
const liveCourse = { ...org, course: 'course-live' };
const archivedCourse = { ...org, course: 'course-archived' };
const itemIn = (courseSection: string | null, project: string | null, course: string | null = 'course-live'): Ids => ({
  ...org,
  course,
  courseSection,
  project,
});

describe('archiveVeto', () => {
  it.each<{ name: string; action: EntityActionType; target: SubjectForPermission; vetoed: boolean }>([
    { name: 'an update of an archived channel', action: 'update', target: subject('course', org, { archived: true }), vetoed: true },
    { name: 'a delete of an archived channel', action: 'delete', target: subject('course', org, { archived: true }), vetoed: false },
    { name: 'a read of an archived channel', action: 'read', target: subject('course', org, { archived: true }), vetoed: false },
    { name: 'an update of a live channel', action: 'update', target: subject('course', org, { archived: false }), vetoed: false },
    {
      name: 'an update of a live channel inside an archived one',
      action: 'update',
      target: subject('courseSection', archivedCourse, { archived: false }),
      vetoed: false,
    },
    { name: 'a create of a sub-channel in an archived channel', action: 'create', target: subject('courseSection', archivedCourse), vetoed: true },
    { name: 'a create of a sub-channel in a live channel', action: 'create', target: subject('courseSection', liveCourse), vetoed: false },
    {
      name: 'a create of a sub-channel in a live channel inside an archived one',
      action: 'create',
      target: subject('project', { ...archivedCourse, courseSection: 'section-live' }),
      vetoed: false,
    },
    {
      name: 'a create of a product in an archived channel',
      action: 'create',
      target: subject('item', itemIn('section-live', 'project-archived')),
      vetoed: true,
    },
    {
      name: 'a create of a product in a live channel',
      action: 'create',
      target: subject('item', itemIn('section-live', 'project-live')),
      vetoed: false,
    },
    {
      name: 'an update of a product homed in an archived channel',
      action: 'update',
      target: subject('item', itemIn('section-live', 'project-archived')),
      vetoed: true,
    },
    {
      name: 'a delete of a product homed in an archived channel',
      action: 'delete',
      target: subject('item', itemIn('section-live', 'project-archived')),
      vetoed: true,
    },
    {
      name: 'a read of a product homed in an archived channel',
      action: 'read',
      target: subject('item', itemIn('section-live', 'project-archived')),
      vetoed: false,
    },
    {
      name: 'an update of a product homed at an archived section, with no project',
      action: 'update',
      target: subject('item', itemIn('section-archived', null)),
      vetoed: true,
    },
    { name: 'an update of a product homed in the organization', action: 'update', target: subject('item', itemIn(null, null, null)), vetoed: false },
    { name: 'a create of a product in the organization', action: 'create', target: subject('item', itemIn(null, null, null)), vetoed: false },
    {
      name: 'an update of a product homed live under an archived ancestor',
      action: 'update',
      target: subject('item', itemIn('section-archived', 'project-live', 'course-archived')),
      vetoed: false,
    },
  ])('$name: vetoed $vetoed', ({ action, target, vetoed }) => {
    expect(archiveVeto(action, target, archivedIds, deepOverrides)).toBe(vetoed);
  });
});
