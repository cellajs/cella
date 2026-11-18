import { sql } from 'drizzle-orm';
import { deepHierarchy as deepH } from 'shared/testing/deep-fixture';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getSeedDb } from '#/db/db';

const seedDb = getSeedDb();

describe('pathColumnSql (SQL shape)', () => {
  it('organization: its own id', () => {
    expect(deepH.pathColumnSql('organization')).toBe('"id"::text');
  });

  it('deep channel: COALESCE-wrapped intermediate ancestors, root-first, plus own id', () => {
    expect(deepH.pathColumnSql('project')).toBe(
      `"organization_id"::text || COALESCE('/' || "course_id"::text, '') || COALESCE('/' || "course_section_id"::text, '') || '/' || "id"::text`,
    );
  });
});

/** The generated-column SQL rule and the JS rule must produce identical paths for every row shape. */
describe('SQL ≍ JS path parity on a live deep-chain table', () => {
  const projectExpr = deepH.pathColumnSql('project');

  beforeAll(async () => {
    await seedDb.execute(
      sql.raw(`
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
    await seedDb.execute(sql.raw('drop table if exists test_path_parity_projects;'));
  });

  it('channel rows: stored path equals computeChannelPath', async () => {
    const projectRows = [
      { id: 'p1', organizationId: 'o1', courseId: 'c1', courseSectionId: 's1' },
      { id: 'p2', organizationId: 'o1', courseId: null, courseSectionId: null },
      // Sparse chain: course null but section set.
      { id: 'p3', organizationId: 'o1', courseId: null, courseSectionId: 's9' },
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
    const stored = await seedDb.execute<{ id: string; path: string }>(sql.raw('select id, path from test_path_parity_projects order by id'));
    for (const { id, path } of stored.rows) {
      const row = projectRows.find((r) => r.id === id);
      expect(path, `project ${id}`).toBe(deepH.computeChannelPath('project', row ?? {}));
    }
  });
});
