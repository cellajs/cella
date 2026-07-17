import { sql } from 'drizzle-orm';
import { computeChannelPath, computeProductPath, createEntityHierarchy, createRoleRegistry, hierarchy } from 'shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDb } from '#/db/db';
import { pathColumnExpression } from './path-column';

/**
 * The generated `path` column (SQL) and `row-path.ts` (JS) must produce identical
 * values for every row shape — CDC routing, move-out detection, and client view
 * routing all assume the two rules agree.
 */

// Synthetic deep hierarchy (projectcampus-shaped), same topology as row-path.test.ts.
const roles = createRoleRegistry(['admin', 'member'] as const);
const deepH = createEntityHierarchy(roles)
  .user()
  .channel('organization', { parent: null, roles: roles.all })
  .channel('course', { parent: 'organization', roles: roles.all })
  .channel('courseSection', { parent: 'course', roles: roles.all })
  .channel('project', { parent: 'courseSection', roles: roles.all })
  .product('item', { parent: 'project', nullableAncestors: ['project', 'courseSection', 'course'] })
  .build();

const deepIdColumns = {
  organization: 'organizationId',
  course: 'courseId',
  courseSection: 'courseSectionId',
  project: 'projectId',
};

describe('pathColumnExpression (SQL shape)', () => {
  it('org-homed product (cella attachment): just the org id', () => {
    expect(pathColumnExpression('attachment', false, hierarchy)).toBe('"organization_id"::text');
  });

  it('root channel (organization): its own id', () => {
    expect(pathColumnExpression('organization', true, hierarchy)).toBe('"id"::text');
  });

  it('deep product: COALESCE-wrapped intermediate ancestors, root-first', () => {
    expect(pathColumnExpression('item', false, deepH, deepIdColumns)).toBe(
      `"organization_id"::text || COALESCE('/' || "course_id"::text, '') || COALESCE('/' || "course_section_id"::text, '') || COALESCE('/' || "project_id"::text, '')`,
    );
  });

  it('deep channel: ancestors plus own id', () => {
    expect(pathColumnExpression('project', true, deepH, deepIdColumns)).toBe(
      `"organization_id"::text || COALESCE('/' || "course_id"::text, '') || COALESCE('/' || "course_section_id"::text, '') || '/' || "id"::text`,
    );
  });
});

describe('SQL ≍ JS path parity on a live deep-chain table', () => {
  const itemExpr = pathColumnExpression('item', false, deepH, deepIdColumns);
  const projectExpr = pathColumnExpression('project', true, deepH, deepIdColumns);

  beforeAll(async () => {
    await seedDb.execute(
      sql.raw(`
        create table test_path_parity_items (
          id varchar primary key,
          organization_id varchar not null,
          course_id varchar,
          course_section_id varchar,
          project_id varchar,
          path text generated always as (${itemExpr}) stored
        );
        create table test_path_parity_projects (
          id varchar primary key,
          organization_id varchar not null,
          course_id varchar,
          course_section_id varchar,
          path text generated always as (${projectExpr}) stored
        );
      `),
    );
  });

  afterAll(async () => {
    await seedDb.execute(
      sql.raw('drop table if exists test_path_parity_items; drop table if exists test_path_parity_projects;'),
    );
  });

  const itemRows = [
    { id: 'i1', organizationId: 'o1', courseId: 'c1', courseSectionId: 's1', projectId: 'p1' },
    { id: 'i2', organizationId: 'o1', courseId: 'c1', courseSectionId: 's1', projectId: null },
    { id: 'i3', organizationId: 'o1', courseId: 'c1', courseSectionId: null, projectId: null },
    { id: 'i4', organizationId: 'o1', courseId: null, courseSectionId: null, projectId: null },
    // Sparse chain (org-level project): section/course null but project set.
    { id: 'i5', organizationId: 'o1', courseId: null, courseSectionId: null, projectId: 'p9' },
  ];

  it('item rows: stored path equals computeProductPath', async () => {
    for (const row of itemRows) {
      await seedDb.execute(
        sql.raw(
          `insert into test_path_parity_items (id, organization_id, course_id, course_section_id, project_id)
           values ('${row.id}', '${row.organizationId}', ${row.courseId ? `'${row.courseId}'` : 'null'},
                   ${row.courseSectionId ? `'${row.courseSectionId}'` : 'null'},
                   ${row.projectId ? `'${row.projectId}'` : 'null'})`,
        ),
      );
    }
    const stored = await seedDb.execute<{ id: string; path: string }>(
      sql.raw('select id, path from test_path_parity_items order by id'),
    );
    for (const { id, path } of stored.rows) {
      const row = itemRows.find((r) => r.id === id);
      expect(path, `item ${id}`).toBe(computeProductPath(deepH, 'item', row ?? {}));
    }
  });

  it('channel rows: stored path equals computeChannelPath', async () => {
    const projectRows = [
      { id: 'p1', organizationId: 'o1', courseId: 'c1', courseSectionId: 's1' },
      { id: 'p2', organizationId: 'o1', courseId: null, courseSectionId: null },
    ];
    for (const row of projectRows) {
      await seedDb.execute(
        sql.raw(
          `insert into test_path_parity_projects (id, organization_id, course_id, course_section_id)
           values ('${row.id}', '${row.organizationId}', ${row.courseId ? `'${row.courseId}'` : 'null'},
                   ${row.courseSectionId ? `'${row.courseSectionId}'` : 'null'})`,
        ),
      );
    }
    const stored = await seedDb.execute<{ id: string; path: string }>(
      sql.raw('select id, path from test_path_parity_projects order by id'),
    );
    for (const { id, path } of stored.rows) {
      const row = projectRows.find((r) => r.id === id);
      expect(path, `project ${id}`).toBe(computeChannelPath(deepH, 'project', row ?? {}));
    }
  });
});
