import { sql } from 'drizzle-orm';
import { createEntityHierarchy, createRoleRegistry } from 'shared';
import { deepHierarchy as deepH } from 'shared/testing/deep-fixture';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDb } from '#/db/db';

/**
 * The path SQL rule (stored as a generated column on channel tables) and the JS rule
 * (computed for product rows) must produce identical values for every row shape. CDC
 * routing, move-out detection, and client view routing all assume the two rules agree.
 * Deep-chain shapes use the shared deep fixture.
 */
const roles = createRoleRegistry(['admin', 'member'] as const);

// Synthetic org-homed product, fork-independent: mirrors cella's default attachment hierarchy
// without binding to the real config (forks that re-home the product would break the assertion).
const orgHomedH = createEntityHierarchy(roles)
  .user()
  .channel('organization', { parent: null, roles: roles.all })
  .product('doc', { parent: 'organization' })
  .build();
describe('pathColumnSql (SQL shape)', () => {
  it('org-homed product: just the org id', () => {
    expect(orgHomedH.pathColumnSql('doc', false)).toBe('"organization_id"::text');
  });

  it('root channel (organization): its own id', () => {
    expect(orgHomedH.pathColumnSql('organization', true)).toBe('"id"::text');
  });

  it('deep product: COALESCE-wrapped intermediate ancestors, root-first', () => {
    expect(deepH.pathColumnSql('item', false)).toBe(
      `"organization_id"::text || COALESCE('/' || "course_id"::text, '') || COALESCE('/' || "course_section_id"::text, '') || COALESCE('/' || "project_id"::text, '')`,
    );
  });

  it('deep channel: ancestors plus own id', () => {
    expect(deepH.pathColumnSql('project', true)).toBe(
      `"organization_id"::text || COALESCE('/' || "course_id"::text, '') || COALESCE('/' || "course_section_id"::text, '') || '/' || "id"::text`,
    );
  });
});

describe('SQL ≍ JS path parity on a live deep-chain table', () => {
  const itemExpr = deepH.pathColumnSql('item', false);
  const projectExpr = deepH.pathColumnSql('project', true);

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
      expect(path, `item ${id}`).toBe(deepH.computeProductPath('item', row ?? {}));
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
      expect(path, `project ${id}`).toBe(deepH.computeChannelPath('project', row ?? {}));
    }
  });
});
