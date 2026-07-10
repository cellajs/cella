import { sql } from 'drizzle-orm';
import { type PgColumn, pgTable, varchar } from 'drizzle-orm/pg-core';
import {
  type AccessPolicies,
  appConfig,
  type ContextEntityType,
  computeCan,
  configureAccessPolicies,
  createEntityHierarchy,
  createRoleRegistry,
  type EntityType,
  getAllDecisions,
  getContextRoles,
  hierarchy,
  type PermissionTopology,
  type PermissionValue,
  type ProductEntityType,
  resolvePermission,
  type SubjectForPermission,
  toColumnName,
} from 'shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDb } from '#/db/db';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { resolveCollectionReadFilterForPolicies } from './collection-scope';
import { buildCollectionReadWhere } from './row-predicates';

/**
 * Check-form / SQL-form / compute-can parity property test.
 *
 * One policy definition drives three enforcement paths:
 * 1. the permission engine's per-subject decision (`getAllDecisions`),
 * 2. the compiled SQL row predicate for collection reads (`buildCollectionReadWhere`,
 *    executed against real Postgres here),
 * 3. the frontend `can` states (`computeCan` + `resolvePermission`).
 *
 * Any divergence between them is a security bug: a row readable via SQL but denied by
 * the engine leaks data; the reverse silently hides rows. This test generates random
 * policy sets (including row-conditional `'own'` grants), memberships and actors, and
 * asserts the three paths agree row-for-row.
 *
 * Config-adaptive: the scenario space is derived from `attachment`'s real ancestor chain, so it
 * runs on any fork. A fork with a nested context (raak: `project → organization`) exercises the
 * sub-context narrowing; an org-only fork (cella: `organization`) skips it (`runIf`).
 */

// attachment's ancestor chain, most-specific → root. raak: [project, organization]; cella: [organization].
const CHAIN = hierarchy.getOrderedAncestors('attachment') as ContextEntityType[];
const ROOT = CHAIN[CHAIN.length - 1]; // organization (the collection is scoped to one root instance)
const SUB = CHAIN.length > 1 ? CHAIN[0] : null; // the narrowable sub-context (project) — null on an org-only fork
const ROOT_ID = 'org1';
const SUB_INSTANCES = SUB ? ['s1', 's2', 's3'] : []; // sub-context instance ids (empty when there is no sub-context)

// Sub-context id column on the scratch table (raak: `project_id`), derived from config. Null on an
// org-only fork, where the read is org-wide and no sub-context column is ever referenced.
const subIdKey = SUB ? appConfig.entityIdColumnKeys[SUB] : null; // 'projectId' | null
const subColumnName = subIdKey ? toColumnName(subIdKey) : null; // 'project_id' | null

/** Scratch table (real Postgres, admin connection): the minimal shape of a product table. */
const baseColumns = {
  id: varchar('id').primaryKey(),
  createdBy: varchar('created_by'),
};
const parityTable = pgTable(
  'test_permission_parity_rows',
  subIdKey && subColumnName ? { ...baseColumns, [subIdKey]: varchar(subColumnName).notNull() } : baseColumns,
);
// The sub-context column passed to `buildCollectionReadWhere`. On an org-only fork the read is
// org-wide (subContextIds always undefined/[]), so this column is never referenced — `id` stands in.
const subContextColumn = (
  subIdKey ? (parityTable as unknown as Record<string, PgColumn>)[subIdKey] : parityTable.id
) as PgColumn;

const USERS = ['u1', 'u2'] as const;

interface ParityRow {
  id: string;
  subContextId: string | null;
  createdBy: string | null;
}

/** Fixed row set: every sub-context (or the single org) × creator. */
const SUB_SLOTS: (string | null)[] = SUB ? SUB_INSTANCES : [null];
const ROWS: ParityRow[] = SUB_SLOTS.flatMap((subContextId) =>
  [...USERS, null].map((createdBy) => ({
    id: `${subContextId ?? 'root'}:${createdBy ?? 'nobody'}`,
    subContextId,
    createdBy,
  })),
);

/** Deterministic PRNG (mulberry32) so failures reproduce exactly. */
const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = <T>(random: () => number, values: readonly T[]): T => {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new Error('pick: empty values');
  return value;
};

/** Random read policy value; other actions stay denied (only `read` matters here). */
const randomReadValue = (random: () => number): PermissionValue => pick(random, [0, 1, 'own'] as const);

/** Policies for `attachment` with random read cells for every context × role in the real chain. */
const randomPolicies = (random: () => number): AccessPolicies =>
  configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
    if (subject.name !== 'attachment') return;
    const builders = contexts as unknown as Record<string, Record<string, (perms: { read: PermissionValue }) => void>>;
    for (const ctx of CHAIN) {
      for (const role of getContextRoles(ctx)) {
        builders[ctx][role]({ read: randomReadValue(random) });
      }
    }
  });

interface Scenario {
  policies: AccessPolicies;
  memberships: MembershipBaseModel[];
  userId: string | undefined;
}

const membership = (contextType: ContextEntityType, contextId: string, role: string): MembershipBaseModel =>
  ({
    id: `mem-${contextType}-${contextId}-${role}`,
    userId: 'actor',
    contextType,
    contextId,
    organizationId: ROOT_ID,
    role,
  }) as unknown as MembershipBaseModel;

const randomScenario = (random: () => number): Scenario => {
  const anonymous = random() < 0.1;
  if (anonymous) {
    return {
      policies: randomPolicies(random),
      memberships: [],
      userId: undefined,
    };
  }

  const memberships: MembershipBaseModel[] = [];
  if (random() < 0.4) memberships.push(membership(ROOT, ROOT_ID, pick(random, getContextRoles(ROOT))));
  if (SUB) {
    for (const subId of SUB_INSTANCES) {
      if (random() < 0.4) memberships.push(membership(SUB, subId, pick(random, getContextRoles(SUB))));
    }
  }
  return {
    policies: randomPolicies(random),
    memberships,
    userId: pick(random, USERS),
  };
};

const rowSubject = (row: ParityRow): SubjectForPermission => ({
  entityType: 'attachment',
  id: row.id,
  createdBy: row.createdBy,
  contextIds: { [ROOT]: ROOT_ID, ...(SUB && row.subContextId !== null ? { [SUB]: row.subContextId } : {}) },
});

/** Path 1: the engine's per-row read decision. */
const engineReadableIds = (scenario: Scenario): Set<string> => {
  const readable = new Set<string>();
  for (const row of ROWS) {
    const { can } = getAllDecisions(scenario.policies, scenario.memberships, rowSubject(row), {
      userId: scenario.userId,
    });
    if (can.read) readable.add(row.id);
  }
  return readable;
};

/** Path 2: the compiled SQL predicate executed against Postgres. */
const sqlReadableIds = async (scenario: Scenario): Promise<Set<string>> => {
  const filter = resolveCollectionReadFilterForPolicies(scenario.policies, scenario.memberships, 'attachment', ROOT_ID);
  const where = buildCollectionReadWhere(filter, parityTable, subContextColumn, scenario.userId);

  if (where.kind === 'none') return new Set();
  const query = seedDb.select({ id: parityTable.id }).from(parityTable);
  const rows = where.kind === 'all' ? await query : await query.where(where.where);
  return new Set(rows.map((r) => r.id));
};

beforeAll(async () => {
  await seedDb.execute(sql`drop table if exists test_permission_parity_rows`);
  await seedDb.execute(
    sql.raw(`
    create table test_permission_parity_rows (
      id varchar primary key,
      created_by varchar${subColumnName ? `,\n      ${subColumnName} varchar not null` : ''}
    )
  `),
  );
  const values = ROWS.map((r) => ({
    id: r.id,
    createdBy: r.createdBy,
    ...(subIdKey && r.subContextId !== null ? { [subIdKey]: r.subContextId } : {}),
  }));
  await seedDb.insert(parityTable).values(values as (typeof parityTable.$inferInsert)[]);
});

afterAll(async () => {
  await seedDb.execute(sql`drop table if exists test_permission_parity_rows`);
});

describe('row-condition parity: engine check ⊆⊇ compiled SQL ⊆⊇ compute-can', () => {
  it('agrees on every row across random policies, memberships and actors', async () => {
    const random = mulberry32(0xa11ce);

    for (let i = 0; i < 250; i++) {
      const scenario = randomScenario(random);
      const label = `seed 0xa11ce scenario ${i} (memberships: ${scenario.memberships
        .map((m) => `${m.contextType}:${m.contextId}:${m.role}`)
        .join(', ')}; user: ${scenario.userId ?? 'anonymous'})`;

      // Engine ⊆⊇ SQL: identical readable row sets.
      const fromEngine = engineReadableIds(scenario);
      const fromSql = await sqlReadableIds(scenario);
      expect(fromSql, label).toEqual(fromEngine);

      // Engine ⊆⊇ compute-can: per single membership, the frontend-resolved state must
      // match the engine's decision for every row in that membership's scope.
      for (const m of scenario.memberships) {
        const canMap = computeCan(m.contextType as ContextEntityType, m, scenario.policies);
        const state = canMap.attachment?.read ?? false;
        const rowsInScope = m.contextType === ROOT ? ROWS : ROWS.filter((r) => r.subContextId === m.contextId);

        for (const row of rowsInScope) {
          const resolved = resolvePermission(state, row.createdBy, scenario.userId);
          const { can } = getAllDecisions(scenario.policies, [m], rowSubject(row), { userId: scenario.userId });
          expect(resolved, `${label}; membership ${m.contextType}:${m.contextId}:${m.role}; row ${row.id}`).toBe(
            can.read,
          );
        }
      }
    }
  });

  // Explicit sub-context narrowing needs a nested context (e.g. organization > project). Skips on an
  // org-only fork, which has no sub-context to narrow into.
  describe.runIf(SUB !== null)('sub-context narrowing', () => {
    it('explicitly requested sub-context narrows conditional scopes the same way', async () => {
      const random = mulberry32(0xbee5);

      for (let i = 0; i < 100; i++) {
        const scenario = randomScenario(random);
        const requestedSubContext = pick(random, SUB_INSTANCES);

        let filter: ReturnType<typeof resolveCollectionReadFilterForPolicies>;
        try {
          filter = resolveCollectionReadFilterForPolicies(
            scenario.policies,
            scenario.memberships,
            'attachment',
            ROOT_ID,
            {
              subContextId: requestedSubContext,
            },
          );
        } catch {
          // 403: no scope at all for the requested sub-context. The engine must agree that
          // no row of it is readable.
          const fromEngine = engineReadableIds(scenario);
          for (const row of ROWS.filter((r) => r.subContextId === requestedSubContext)) {
            expect(fromEngine.has(row.id), `seed 0xbee5 scenario ${i} row ${row.id}`).toBe(false);
          }
          continue;
        }

        const where = buildCollectionReadWhere(filter, parityTable, subContextColumn, scenario.userId);
        const fromSqlAll =
          where.kind === 'none'
            ? new Set<string>()
            : new Set(
                (where.kind === 'all'
                  ? await seedDb.select({ id: parityTable.id }).from(parityTable)
                  : await seedDb.select({ id: parityTable.id }).from(parityTable).where(where.where)
                ).map((r) => r.id),
              );

        // Narrowed SQL result == engine-readable rows of the requested sub-context.
        const fromEngine = engineReadableIds(scenario);
        const expected = new Set(
          ROWS.filter((r) => r.subContextId === requestedSubContext && fromEngine.has(r.id)).map((r) => r.id),
        );
        expect(fromSqlAll, `seed 0xbee5 scenario ${i} sub-context ${requestedSubContext}`).toEqual(expected);
      }
    });
  });
});

/******************************************************************************
 * Deep-chain parity: 4-level SYNTHETIC hierarchy (organization > course >
 * courseSection > project, product `item` parented to project with nullable
 * ancestors) — exercises intermediate ancestor-level grants (course /
 * courseSection) that a 2-level config structurally cannot reach. Both paths
 * run on the same topology seam: the engine via `getAllDecisions(…, { topology })`,
 * the scope compiler via `resolveCollectionReadFilterForPolicies(…, topology)`.
 * The casts naming synthetic entities are contained in the fixtures below,
 * mirroring `shared/src/testing/wide-fixture.ts`.
 ******************************************************************************/

const deepRoles = createRoleRegistry(['admin', 'member', 'staff', 'student', 'owner', 'follower'] as const);
const deepHierarchy = createEntityHierarchy(deepRoles)
  .user()
  .context('organization', { parent: null, roles: ['admin', 'member'] })
  .context('course', { parent: 'organization', roles: ['staff', 'student'] })
  .context('courseSection', { parent: 'course', roles: ['staff', 'student'] })
  .context('project', { parent: 'courseSection', roles: ['owner', 'follower'] })
  .product('item', { parent: 'project', nullableAncestors: ['project', 'courseSection', 'course'] })
  .build();
const deepTopology: PermissionTopology = { hierarchy: deepHierarchy };

type DeepContextType = 'organization' | 'course' | 'courseSection' | 'project';
const DEEP_ENTITY_TYPES = ['user', 'organization', 'course', 'courseSection', 'project', 'item'] as const;
const DEEP_CONTEXT_ROLES = {
  organization: ['admin', 'member'],
  course: ['staff', 'student'],
  courseSection: ['staff', 'student'],
  project: ['owner', 'follower'],
} as const satisfies Record<DeepContextType, readonly string[]>;
const DEEP_ITEM = 'item' as unknown as ProductEntityType;

// Column keys follow the `${contextType}Id` convention `buildCollectionReadWhere` falls
// back to for topology levels absent from `appConfig.entityIdColumnKeys`.
const deepParityTable = pgTable('test_permission_parity_deep_rows', {
  id: varchar('id').primaryKey(),
  organizationId: varchar('organization_id').notNull(),
  courseId: varchar('course_id'),
  courseSectionId: varchar('course_section_id'),
  projectId: varchar('project_id'),
  createdBy: varchar('created_by'),
});

interface DeepParityRow {
  id: string;
  organizationId: string;
  courseId: string | null;
  courseSectionId: string | null;
  projectId: string | null;
  createdBy: string | null;
}

/** Placements across all four depths; p1 sits under s1/c1, p2 under c2, p3 is org-level. */
const DEEP_PLACEMENTS = [
  { key: 'org', courseId: null, courseSectionId: null, projectId: null },
  { key: 'c1', courseId: 'c1', courseSectionId: null, projectId: null },
  { key: 's1', courseId: 'c1', courseSectionId: 's1', projectId: null },
  { key: 'p1', courseId: 'c1', courseSectionId: 's1', projectId: 'p1' },
  { key: 'p2', courseId: 'c2', courseSectionId: null, projectId: 'p2' },
  { key: 'p3', courseId: null, courseSectionId: null, projectId: 'p3' },
] as const;

/** Fixed row set: every placement × creator. */
const DEEP_ROWS: DeepParityRow[] = [...USERS, null].flatMap((createdBy) =>
  DEEP_PLACEMENTS.map((placement) => ({
    id: `${createdBy ?? 'nobody'}:${placement.key}`,
    organizationId: ROOT_ID,
    courseId: placement.courseId,
    courseSectionId: placement.courseSectionId,
    projectId: placement.projectId,
    createdBy,
  })),
);

/** Policies for `item` over the synthetic topology, one read cell per context × role. */
const deepPolicies = (readValue: (contextType: DeepContextType, role: string) => PermissionValue): AccessPolicies =>
  configureAccessPolicies(
    DEEP_ENTITY_TYPES as unknown as readonly EntityType[],
    ({ subject, contexts }) => {
      if ((subject.name as string) !== 'item') return;
      const builders = contexts as unknown as Record<
        DeepContextType,
        Record<string, (perms: { read: PermissionValue }) => void>
      >;
      for (const [contextType, roles] of Object.entries(DEEP_CONTEXT_ROLES) as [DeepContextType, readonly string[]][]) {
        for (const role of roles) builders[contextType][role]({ read: readValue(contextType, role) });
      }
    },
    deepTopology,
  );

const deepMembership = (contextType: DeepContextType, contextId: string, role: string): MembershipBaseModel =>
  ({
    id: `mem-${contextType}-${contextId}-${role}`,
    userId: 'actor',
    contextType,
    contextId,
    organizationId: ROOT_ID,
    role,
  }) as unknown as MembershipBaseModel;

interface DeepScenario {
  policies: AccessPolicies;
  memberships: MembershipBaseModel[];
  userId: string | undefined;
}

const randomDeepScenario = (random: () => number): DeepScenario => {
  const memberships: MembershipBaseModel[] = [];
  if (random() < 0.5)
    memberships.push(deepMembership('organization', ROOT_ID, pick(random, DEEP_CONTEXT_ROLES.organization)));
  if (random() < 0.5) memberships.push(deepMembership('course', 'c1', pick(random, DEEP_CONTEXT_ROLES.course)));
  if (random() < 0.3) memberships.push(deepMembership('course', 'c2', pick(random, DEEP_CONTEXT_ROLES.course)));
  if (random() < 0.5)
    memberships.push(deepMembership('courseSection', 's1', pick(random, DEEP_CONTEXT_ROLES.courseSection)));
  if (random() < 0.5) memberships.push(deepMembership('project', 'p1', pick(random, DEEP_CONTEXT_ROLES.project)));
  if (random() < 0.3) memberships.push(deepMembership('project', 'p3', pick(random, DEEP_CONTEXT_ROLES.project)));
  return {
    policies: deepPolicies(() => randomReadValue(random)),
    memberships,
    userId: random() < 0.9 ? pick(random, USERS) : undefined,
  };
};

const deepRowSubject = (row: DeepParityRow): SubjectForPermission =>
  ({
    entityType: 'item',
    id: row.id,
    createdBy: row.createdBy,
    contextIds: {
      organization: ROOT_ID,
      course: row.courseId,
      courseSection: row.courseSectionId,
      project: row.projectId,
    },
  }) as unknown as SubjectForPermission;

/** Path 1: the engine's per-row read decision, over the synthetic topology. */
const deepEngineReadableIds = (scenario: DeepScenario, subtreeRoles?: readonly string[]): Set<string> => {
  const readable = new Set<string>();
  for (const row of DEEP_ROWS) {
    const { can } = getAllDecisions(scenario.policies, scenario.memberships, deepRowSubject(row), {
      userId: scenario.userId,
      topology: deepTopology,
      ...(subtreeRoles && { subtreeRoles }),
    });
    if (can.read) readable.add(row.id);
  }
  return readable;
};

/** Path 2: the compiled SQL predicate executed against Postgres, same topology. */
const deepSqlReadableIds = async (scenario: DeepScenario, subtreeRoles?: readonly string[]): Promise<Set<string>> => {
  const filter = resolveCollectionReadFilterForPolicies(
    scenario.policies,
    scenario.memberships,
    DEEP_ITEM,
    ROOT_ID,
    undefined,
    subtreeRoles,
    deepTopology,
  );
  const where = buildCollectionReadWhere(filter, deepParityTable, deepParityTable.projectId, scenario.userId);

  if (where.kind === 'none') return new Set();
  const query = seedDb.select({ id: deepParityTable.id }).from(deepParityTable);
  const rows = where.kind === 'all' ? await query : await query.where(where.where);
  return new Set(rows.map((r) => r.id));
};

const deepScenarioLabel = (seed: string, i: number, scenario: DeepScenario): string =>
  `seed ${seed} scenario ${i} (memberships: ${scenario.memberships
    .map((m) => `${m.contextType}:${m.contextId}:${m.role}`)
    .join(', ')}; user: ${scenario.userId ?? 'anonymous'})`;

beforeAll(async () => {
  await seedDb.execute(sql`drop table if exists test_permission_parity_deep_rows`);
  await seedDb.execute(sql`
    create table test_permission_parity_deep_rows (
      id varchar primary key,
      organization_id varchar not null,
      course_id varchar,
      course_section_id varchar,
      project_id varchar,
      created_by varchar
    )
  `);
  await seedDb.insert(deepParityTable).values(DEEP_ROWS);
});

afterAll(async () => {
  await seedDb.execute(sql`drop table if exists test_permission_parity_deep_rows`);
});

describe('deep-chain parity: intermediate ancestor grants agree between engine and SQL', () => {
  it('agrees on every row across random policies, multi-level memberships and actors', async () => {
    const random = mulberry32(0xdeec);

    for (let i = 0; i < 250; i++) {
      const scenario = randomDeepScenario(random);
      const label = deepScenarioLabel('0xdeec', i, scenario);

      const fromEngine = deepEngineReadableIds(scenario);
      const fromSql = await deepSqlReadableIds(scenario);
      expect(fromSql, label).toEqual(fromEngine);
    }
  });
});

/******************************************************************************
 * subtreeRoles parity (same synthetic topology): with `subtreeRoles` configured,
 * a product grant of a non-listed role speaks only for rows HOMED at its own
 * context level, while listed roles (admin/staff) keep subtree scope. Engine
 * (`getAllDecisions(…, { subtreeRoles })`) ≍ compiled SQL, row for row.
 ******************************************************************************/

const SUBTREE_ROLES = ['admin', 'staff'] as const;

describe('subtreeRoles parity: home-scoped grants agree between engine and SQL', () => {
  it('agrees on every row across random policies and memberships with subtreeRoles configured', async () => {
    const random = mulberry32(0x50b7);

    for (let i = 0; i < 100; i++) {
      const scenario = randomDeepScenario(random);
      const label = deepScenarioLabel('0x50b7', i, scenario);

      const fromEngine = deepEngineReadableIds(scenario, SUBTREE_ROLES);
      const fromSql = await deepSqlReadableIds(scenario, SUBTREE_ROLES);
      expect(fromSql, label).toEqual(fromEngine);
    }
  });

  it('scopes a non-subtree course grant to course-HOMED rows only', async () => {
    const scenario: DeepScenario = {
      policies: deepPolicies((contextType, role) => (contextType === 'course' && role === 'student' ? 1 : 0)),
      memberships: [deepMembership('course', 'c1', 'student')],
      userId: 'u1',
    };
    // Rows homed at c1 itself — NOT the section/project rows physically below it.
    const expected = new Set(
      DEEP_ROWS.filter((r) => r.courseId === 'c1' && r.courseSectionId === null && r.projectId === null).map(
        (r) => r.id,
      ),
    );
    expect(deepEngineReadableIds(scenario, SUBTREE_ROLES)).toEqual(expected);
    expect(await deepSqlReadableIds(scenario, SUBTREE_ROLES)).toEqual(expected);
  });

  it('keeps subtree scope for a listed (staff) course grant', async () => {
    const scenario: DeepScenario = {
      policies: deepPolicies((contextType, role) => (contextType === 'course' && role === 'staff' ? 1 : 0)),
      memberships: [deepMembership('course', 'c1', 'staff')],
      userId: 'u1',
    };
    // Everything physically below c1: the course row plus its section and project rows.
    const expected = new Set(DEEP_ROWS.filter((r) => r.courseId === 'c1').map((r) => r.id));
    expect(deepEngineReadableIds(scenario, SUBTREE_ROLES)).toEqual(expected);
    expect(await deepSqlReadableIds(scenario, SUBTREE_ROLES)).toEqual(expected);
  });

  it("matches a home-scoped 'own' grant only on the author's home-level rows", async () => {
    const scenario: DeepScenario = {
      policies: deepPolicies((contextType, role) => (contextType === 'course' && role === 'student' ? 'own' : 0)),
      memberships: [deepMembership('course', 'c1', 'student')],
      userId: 'u1',
    };
    const expected = new Set(
      DEEP_ROWS.filter(
        (r) => r.courseId === 'c1' && r.courseSectionId === null && r.projectId === null && r.createdBy === 'u1',
      ).map((r) => r.id),
    );
    expect(deepEngineReadableIds(scenario, SUBTREE_ROLES)).toEqual(expected);
    expect(await deepSqlReadableIds(scenario, SUBTREE_ROLES)).toEqual(expected);
  });
});
