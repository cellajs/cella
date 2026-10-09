import { eq, getTableName, sql } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';
import type { Pgoutput } from 'pg-logical-replication';
import type { ActivityAction, ProductEntityType } from 'shared';
import { describe, expect, it, vi } from 'vitest';
import type { PendingEvent } from '../../types';

/**
 * The books on a deep hierarchy with an embedding, which the template itself does not have. The worker's own code
 * (parser, transaction buffer, counter deltas, the cleanup of embedding references) runs over a random workload on
 * synthetic tables in a schema of its own, and the recount of the backend counts those tables. The two must agree as
 * a verify compares them. Everything happens in one transaction that is rolled back: no table, slot or row is left.
 */

// organization > course > courseSection > project, with `item` at any depth and `task` in a project.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const { deepHierarchy, deepRoles } = await import('shared/testing/deep-fixture');

  return {
    ...actual,
    hierarchy: deepHierarchy,
    roles: deepRoles,
    isChannel: deepHierarchy.isChannel,
    isProduct: deepHierarchy.isProduct,
    appConfig: {
      ...actual.appConfig,
      channelEntityTypes: deepHierarchy.channelTypes,
      productEntityTypes: deepHierarchy.productTypes,
      entityIdColumnKeys: deepHierarchy.idColumnKeys,
      // A task holds the ids of items: the `labels` of an app.
      productEmbeddings: [{ embeddedProduct: 'item', hostProduct: 'task', hostColumn: 'items' }],
    },
  };
});

vi.mock('#/tables', async () => {
  const { bigint, jsonb, pgTable, text, timestamp, uuid } = await import('drizzle-orm/pg-core');
  const { getTableName: nameOf } = await import('drizzle-orm');

  const id = () => uuid('id').primaryKey();
  const organizationId = () => uuid('organization_id').notNull();
  const product = () => ({
    id: id(),
    organizationId: organizationId(),
    courseId: uuid('course_id'),
    courseSectionId: uuid('course_section_id'),
    projectId: uuid('project_id'),
    name: text('name'),
    seq: bigint('seq', { mode: 'number' }).notNull().default(0),
    deletedAt: timestamp('deleted_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }),
    stx: jsonb('stx'),
  });
  const membership = () => ({
    id: id(),
    organizationId: organizationId(),
    courseId: uuid('course_id'),
    courseSectionId: uuid('course_section_id'),
    projectId: uuid('project_id'),
    channelType: text('channel_type').notNull(),
    channelId: uuid('channel_id').notNull(),
    role: text('role').notNull(),
  });

  const entityTables = {
    organization: pgTable('organizations', { id: id() }),
    course: pgTable('courses', { id: id(), organizationId: organizationId() }),
    courseSection: pgTable('course_sections', { id: id(), organizationId: organizationId(), courseId: uuid('course_id').notNull() }),
    project: pgTable('projects', {
      id: id(),
      organizationId: organizationId(),
      courseId: uuid('course_id').notNull(),
      courseSectionId: uuid('course_section_id').notNull(),
    }),
    item: pgTable('items', product()),
    task: pgTable('tasks', { ...product(), items: uuid('items').array().notNull() }),
  };
  const resourceTables = {
    membership: pgTable('memberships', membership()),
    inactive_membership: pgTable('inactive_memberships', { ...membership(), rejectedAt: timestamp('rejected_at', { mode: 'string' }) }),
  };

  return {
    entityTables,
    resourceTables,
    entityTableNames: Object.values(entityTables).map((table) => nameOf(table)),
    resourceTableNames: Object.values(resourceTables).map((table) => nameOf(table)),
    getEntityTable: (type: keyof typeof entityTables) => entityTables[type],
  };
});

type SyntheticTable = AnyPgTable & { id: AnyPgColumn };
type Row = Record<string, unknown> & { id: string };

const tables = (await import('#/tables')) as unknown as {
  entityTables: Record<string, SyntheticTable>;
  resourceTables: Record<string, SyntheticTable>;
};
const { cdcDb } = await import('../../lib/db');
const { cleanupEmbeddingReferences } = await import('../../embeddings/embedding-cleanup');
const { parseMessage } = await import('../../pipeline/parse-message');
const { compareBooks } = await import('../../pipeline/verify');
const { TransactionBuffer } = await import('../../services/transaction-buffer');
const { applyBatchUnifiedDeltas } = await import('../../utils/apply-unified-deltas');
const { computeBatchUnifiedDeltas } = await import('../../utils/compute-unified-deltas');
const { computeChannelCounters } = await import('#/modules/entities/counters-queries');

type Tx = Parameters<Parameters<typeof cdcDb.transaction>[0]>[0];

const SCHEMA = 'books_agreement';
const ancestorColumns = 'organization_id uuid NOT NULL, course_id uuid, course_section_id uuid, project_id uuid';
const productColumns = `id uuid PRIMARY KEY, ${ancestorColumns}, name text, seq bigint NOT NULL DEFAULT 0, deleted_at timestamp, created_at timestamp NOT NULL, updated_at timestamp, stx jsonb`;
const membershipColumns = `id uuid PRIMARY KEY, ${ancestorColumns}, channel_type text NOT NULL, channel_id uuid NOT NULL, role text NOT NULL`;
const ddl = [
  `CREATE SCHEMA ${SCHEMA}`,
  // Unqualified names resolve here first: the recount and the worker's statements name their tables without a schema.
  `SET LOCAL search_path = ${SCHEMA}, public`,
  'CREATE TABLE organizations (id uuid PRIMARY KEY)',
  'CREATE TABLE courses (id uuid PRIMARY KEY, organization_id uuid NOT NULL)',
  'CREATE TABLE course_sections (id uuid PRIMARY KEY, organization_id uuid NOT NULL, course_id uuid NOT NULL)',
  'CREATE TABLE projects (id uuid PRIMARY KEY, organization_id uuid NOT NULL, course_id uuid NOT NULL, course_section_id uuid NOT NULL)',
  `CREATE TABLE items (${productColumns})`,
  `CREATE TABLE tasks (${productColumns}, items uuid[] NOT NULL DEFAULT '{}')`,
  `CREATE TABLE memberships (${membershipColumns})`,
  `CREATE TABLE inactive_memberships (${membershipColumns}, rejected_at timestamp)`,
  'CREATE TABLE channel_counters (LIKE public.channel_counters INCLUDING ALL)',
];

/** A change as the stream delivers it: the table and the row images. */
type Change = { table: string; tag: 'insert' | 'update' | 'delete'; old?: Row; new?: Row };

/** Rolls the transaction back once the case is through. */
class Done extends Error {}

/** A seeded generator, so a run that fails can be run again. */
function randomOf(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (below: number) => Math.floor(next() * below),
    pick: <T>(list: readonly T[]): T | undefined => list[Math.floor(next() * list.length)],
    some: <T>(list: readonly T[], atMost: number): T[] => list.filter(() => next() < 0.5).slice(0, atMost),
  };
}

/** The workload of one run on one transaction: the rows it made, and the worker's side of every change. */
function workloadOn(tx: Tx, seed: number) {
  const random = randomOf(seed);
  const log: string[] = [];
  let ids = 0;
  let clock = Date.UTC(2026, 9, 1);
  let transactions = 0;

  const newId = () => `00000000-0000-4000-8000-${(++ids).toString(16).padStart(12, '0')}`;
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString().replace('T', ' ').replace('Z', '');
  };
  const tableOf = (type: string) => tables.entityTables[type] ?? tables.resourceTables[type];
  const sqlName = (type: string) => getTableName(tableOf(type));

  const read = async (type: string, id: string): Promise<Row | undefined> => {
    const table = tableOf(type);
    const rows = await tx.select().from(table).where(eq(table.id, id));
    return rows[0] as Row | undefined;
  };
  const all = async (type: string): Promise<Row[]> => (await tx.select().from(tableOf(type))) as Row[];

  /** Writes a row and returns the change the stream would deliver for it. */
  const insert = async (type: string, row: Row): Promise<Change> => {
    await tx.insert(tableOf(type)).values(row);
    return { table: sqlName(type), tag: 'insert', new: (await read(type, row.id)) as Row };
  };
  const update = async (type: string, id: string, values: Record<string, unknown>): Promise<Change> => {
    const table = tableOf(type);
    const old = (await read(type, id)) as Row;
    await tx.update(table).set(values).where(eq(table.id, id));
    return { table: sqlName(type), tag: 'update', old, new: (await read(type, id)) as Row };
  };
  const remove = async (type: string, id: string): Promise<Change> => {
    const table = tableOf(type);
    const old = (await read(type, id)) as Row;
    await tx.delete(table).where(eq(table.id, id));
    return { table: sqlName(type), tag: 'delete', old };
  };

  /** What an edit through the API puts on a row beside the edit itself. */
  const edit = (values: Record<string, unknown>) => ({
    ...values,
    updatedAt: now(),
    stx: { mutationId: newId(), sourceId: 'tab-1', changedFields: [...Object.keys(values), 'updatedAt'] },
  });

  /**
   * One source transaction through the worker: parsed, buffered until its commit, counted, and cleaned up after. The
   * worker's own cleanup writes come back as changes of their own, as they do from the slot.
   */
  const deliver = async (changes: Change[]): Promise<PendingEvent[]> => {
    const survivors: PendingEvent[] = [];
    const buffer = new TransactionBuffer(async (events) => {
      survivors.push(...events);
    });
    const xid = ++transactions;
    buffer.onBegin({
      tag: 'begin',
      xid,
      commitLsn: `0/${xid.toString(16).toUpperCase()}`,
      commitTime: BigInt(0),
    } as unknown as Pgoutput.MessageBegin);
    for (const [index, change] of changes.entries()) {
      const message = { tag: change.tag, relation: { name: change.table }, old: change.old, new: change.new } as unknown as Pgoutput.Message;
      const result = parseMessage(message);
      if (result) await buffer.onEvent(`0/${xid.toString(16)}`, result, index);
    }
    await buffer.onCommit();
    if (survivors.length === 0) return survivors;

    await applyBatchUnifiedDeltas(computeBatchUnifiedDeltas(survivors), tx);

    const groups = new Map<string, PendingEvent[]>();
    for (const event of survivors) {
      const { entityType, action } = event.result.activity;
      // The synthetic types are no type of the app, so the name is compared as a string.
      if ((entityType as string | null) !== 'item' || action === 'create') continue;
      groups.set(action, [...(groups.get(action) ?? []), event]);
    }
    for (const [action, events] of groups) {
      const before = await all('task');
      await cleanupEmbeddingReferences(
        'item' as ProductEntityType,
        action as Exclude<ActivityAction, 'create'>,
        events,
        tx as unknown as typeof cdcDb,
      );
      const after = new Map((await all('task')).map((task) => [task.id, task]));
      const stripped: Change[] = [];
      for (const old of before) {
        const current = after.get(old.id);
        if (current && JSON.stringify(current.items) !== JSON.stringify(old.items))
          stripped.push({ table: 'tasks', tag: 'update', old, new: current });
      }
      // The strip is no activity: nothing of it may survive the parser.
      if (stripped.length > 0) expect(await deliver(stripped)).toEqual([]);
    }
    return survivors;
  };

  const run = async (name: string, changes: Change[]) => {
    log.push(`${name}: ${changes.map((change) => `${change.tag} ${change.table} ${(change.new ?? change.old)?.id.slice(-4)}`).join(', ')}`);
    await deliver(changes);
  };

  /** The channels of an organization. A row never leaves its organization. */
  const placements = async (organizationId: string) => {
    const own = (rows: Row[]) => rows.filter((row) => row.organizationId === organizationId);
    return { courses: own(await all('course')), sections: own(await all('courseSection')), projects: own(await all('project')) };
  };
  /** Where a row can live: its organization, and any prefix of course, section and project. */
  const anywhere = async (organizationId: string) => {
    const { courses, sections, projects } = await placements(organizationId);
    const depth = random.int(4);
    const project = depth === 3 ? random.pick(projects) : undefined;
    if (project) return { organizationId, courseId: project.courseId, courseSectionId: project.courseSectionId, projectId: project.id };
    const section = depth >= 2 ? random.pick(sections) : undefined;
    if (section) return { organizationId, courseId: section.courseId, courseSectionId: section.id, projectId: null };
    const course = depth >= 1 ? random.pick(courses) : undefined;
    return { organizationId, courseId: course?.id ?? null, courseSectionId: null, projectId: null };
  };

  const live = (rows: Row[]) => rows.filter((row) => row.deletedAt == null);
  const deleted = (rows: Row[]) => rows.filter((row) => row.deletedAt != null);

  /** A channel goes, and every row under it with it, in one transaction. The order of the deletes is not fixed. */
  const removeChannel = async (name: string, type: 'course' | 'courseSection' | 'project', channel: Row) => {
    const column = { course: 'courseId', courseSection: 'courseSectionId', project: 'projectId' }[type];
    const changes: Change[] = [];
    for (const childType of ['task', 'item', 'membership', 'inactive_membership', 'project', 'courseSection']) {
      for (const child of await all(childType)) if (child[column] === channel.id) changes.push(await remove(childType, child.id));
    }
    const own = await remove(type, channel.id);
    // Rows before their channel, or the channel first: Postgres promises neither.
    await run(name, random.next() < 0.5 ? [own, ...changes] : [...changes, own]);
  };

  const steps: Array<(organizationId: string) => Promise<void>> = [
    // ── Channels ────────────────────────────────────────────────────────────────────────────────────────────────────
    async (organizationId) => run('create course', [await insert('course', { id: newId(), organizationId })]),
    async (organizationId) => {
      const course = random.pick((await placements(organizationId)).courses);
      if (course) await run('create section', [await insert('courseSection', { id: newId(), organizationId, courseId: course.id })]);
    },
    async (organizationId) => {
      const section = random.pick((await placements(organizationId)).sections);
      if (!section) return;
      await run('create project', [
        await insert('project', { id: newId(), organizationId, courseId: section.courseId, courseSectionId: section.id }),
      ]);
    },
    async (organizationId) => {
      const project = random.pick((await placements(organizationId)).projects);
      if (project && random.next() < 0.5) await removeChannel('delete project', 'project', project);
    },
    async (organizationId) => {
      const section = random.pick((await placements(organizationId)).sections);
      if (section && random.next() < 0.25) await removeChannel('delete section', 'courseSection', section);
    },
    async (organizationId) => {
      const course = random.pick((await placements(organizationId)).courses);
      if (course && random.next() < 0.15) await removeChannel('delete course', 'course', course);
    },
    // ── Items: the embedded product, at any depth ──────────────────────────────────────────────────────────────────
    async (organizationId) =>
      run('create item', [await insert('item', { id: newId(), ...(await anywhere(organizationId)), name: 'item', createdAt: now() })]),
    async (organizationId) =>
      run('create item', [await insert('item', { id: newId(), ...(await anywhere(organizationId)), name: 'item', createdAt: now() })]),
    async () => {
      const item = random.pick(live(await all('item')));
      if (item) await run('soft delete item', [await update('item', item.id, edit({ deletedAt: now() }))]);
    },
    async () => {
      const item = random.pick(deleted(await all('item')));
      if (item) await run('restore item', [await update('item', item.id, edit({ deletedAt: null }))]);
    },
    // A live row moves inside its organization. The API edits no tombstone, and the worker takes no change of one.
    async () => {
      const item = random.pick(live(await all('item')));
      if (item) await run('move item', [await update('item', item.id, edit(await anywhere(item.organizationId as string)))]);
    },
    async () => {
      const item = random.pick(await all('item'));
      if (item) await run('delete item', [await remove('item', item.id)]);
    },
    // ── Tasks: the host, in a project ──────────────────────────────────────────────────────────────────────────────
    async (organizationId) => {
      const project = random.pick((await placements(organizationId)).projects);
      if (!project) return;
      const held = random.some(live(await all('item')), 3).map((item) => item.id);
      const place = { organizationId, courseId: project.courseId, courseSectionId: project.courseSectionId, projectId: project.id };
      await run('create task', [await insert('task', { id: newId(), ...place, name: 'task', items: held, createdAt: now() })]);
    },
    async () => {
      const task = random.pick(live(await all('task')));
      if (!task) return;
      const held = random.some(live(await all('item')), 3).map((item) => item.id);
      await run('edit task items', [await update('task', task.id, edit({ items: held }))]);
    },
    async () => {
      const task = random.pick(live(await all('task')));
      if (task) await run('soft delete task', [await update('task', task.id, edit({ deletedAt: now() }))]);
    },
    async () => {
      const task = random.pick(deleted(await all('task')));
      if (task) await run('restore task', [await update('task', task.id, edit({ deletedAt: null }))]);
    },
    async () => {
      const task = random.pick(await all('task'));
      if (task) await run('delete task', [await remove('task', task.id)]);
    },
    // An item is deleted, the API takes it off its hosts in the same transaction, and renames or deletes another task there.
    async () => {
      const item = random.pick(await all('item'));
      if (!item) return;
      const changes = [await remove('item', item.id)];
      for (const task of await all('task')) {
        const held = task.items as string[];
        if (held.includes(item.id)) changes.push(await update('task', task.id, edit({ items: held.filter((id) => id !== item.id) })));
      }
      const other = random.pick(live(await all('task')));
      if (other) changes.push(await update('task', other.id, random.next() < 0.5 ? edit({ name: 'renamed' }) : edit({ deletedAt: now() })));
      await run('delete item with its references', changes);
    },
    // ── Memberships, of the organization and of a channel below it ────────────────────────────────────────────────
    async (organizationId) => {
      const role = random.pick(['admin', 'member'] as const) ?? 'member';
      const place = { organizationId, courseId: null, courseSectionId: null, projectId: null };
      await run('add organization member', [
        await insert('membership', { id: newId(), ...place, channelType: 'organization', channelId: organizationId, role }),
      ]);
    },
    async (organizationId) => {
      const course = random.pick((await placements(organizationId)).courses);
      if (!course) return;
      const role = random.pick(['staff', 'student'] as const) ?? 'student';
      const place = { organizationId, courseId: course.id, courseSectionId: null, projectId: null };
      await run('add course member', [await insert('membership', { id: newId(), ...place, channelType: 'course', channelId: course.id, role })]);
    },
    async () => {
      const membership = random.pick(await all('membership'));
      if (membership) await run('remove member', [await remove('membership', membership.id)]);
    },
    async (organizationId) => {
      const place = { organizationId, courseId: null, courseSectionId: null, projectId: null };
      const invite = { id: newId(), ...place, channelType: 'organization', channelId: organizationId, role: 'member', rejectedAt: null };
      await run('invite', [await insert('inactive_membership', invite)]);
    },
    async () => {
      const invite = random.pick((await all('inactive_membership')).filter((row) => row.rejectedAt == null));
      if (invite) await run('reject invite', [await update('inactive_membership', invite.id, { rejectedAt: now() })]);
    },
  ];

  /** What a verify would find wrong: the stored counters against a count from the tables. */
  const differences = async () => {
    const stored = await tx.execute<{ channel_key: string; counts: Record<string, number> }>(sql`SELECT channel_key, counts FROM channel_counters`);
    const counted = await computeChannelCounters({ var: { db: tx } });
    return compareBooks(new Map(stored.rows.map((row) => [row.channel_key, row.counts])), counted, new Map());
  };

  return { random, steps, log, newId, insert, run, differences };
}

/** Runs `body` on synthetic tables that exist for its transaction only. */
async function onSyntheticTables(body: (tx: Tx) => Promise<void>): Promise<void> {
  await cdcDb
    .transaction(async (tx) => {
      for (const statement of ddl) await tx.execute(sql.raw(statement));
      await body(tx);
      throw new Done();
    })
    .catch((error) => {
      if (!(error instanceof Done)) throw error;
    });
}

describe('The books on a deep hierarchy with an embedding (integration)', () => {
  it.each([11, 23, 47, 101])(
    'agree with a recount from the tables after a random workload (seed %i)',
    async (seed) => {
      await onSyntheticTables(async (tx) => {
        const workload = workloadOn(tx, seed);
        const organizations = [workload.newId(), workload.newId()];
        for (const id of organizations) await tx.execute(sql`INSERT INTO organizations (id) VALUES (${id}::uuid)`);

        for (let step = 1; step <= 240; step++) {
          const organizationId = organizations[workload.random.int(organizations.length)];
          await (workload.random.pick(workload.steps) as (typeof workload.steps)[number])(organizationId);

          // Compared often, so a difference names the step that made it.
          if (step % 12 === 0) {
            const wrong = await workload.differences();
            if (wrong.length > 0) throw new Error(`step ${step}: ${JSON.stringify(wrong)}\n${workload.log.slice(-14).join('\n')}`);
          }
        }

        expect(await workload.differences()).toEqual([]);
        // The run did something: it is not a workload of steps that all found nothing to do.
        expect(workload.log.length).toBeGreaterThan(100);
      });
    },
    120_000,
  );

  it('leaves no trace in the database', async () => {
    const left = await cdcDb.execute(sql`SELECT 1 FROM pg_namespace WHERE nspname = ${SCHEMA}`);

    expect(left.rows).toEqual([]);
  });
});
