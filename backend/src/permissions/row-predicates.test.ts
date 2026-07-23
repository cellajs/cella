import { sql } from 'drizzle-orm';
import { type PgColumn, pgTable, varchar } from 'drizzle-orm/pg-core';
import {
  type Actor,
  appConfig,
  type ChannelEntityType,
  computeCan,
  getAllDecisions,
  hierarchy,
  type PolicyCellInput,
  type PolicyMatrix,
  type ProductEntityType,
  type PublicReadGrants,
  resolveCan,
  type SubjectForPermission,
  toColumnName,
} from 'shared';
import {
  type DeepChannelType,
  deepChannelRoles,
  deepOverrides,
  deepReadPolicies as deepPolicies,
} from 'shared/testing/deep-fixture';
import { configurePolicyMatrix } from 'shared/testing/policies';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDb } from '#/db/db';
import { canReceiveProductEvent } from '#/modules/entities/helpers/dispatch-to-stream';
import type { AppStreamProductEvent } from '#/modules/entities/stream/types';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { checkAccess } from './check-access';
import { resolveCollectionReadFilter, resolveCollectionReadFilterForPolicies } from './collection-scope';
import { buildCollectionReadWhere } from './row-predicates';

// attachment's ancestor chain, most-specific → root. raak: [project, organization]; cella: [organization].
const CHAIN = hierarchy.getOrderedAncestors('attachment') as ChannelEntityType[];
const ROOT = CHAIN[CHAIN.length - 1]; // organization (the collection is scoped to one root instance)
const HOME = CHAIN.length > 1 ? CHAIN[0] : null; // narrowable home-channel, null on an org-only fork
const ROOT_ID = 'org1';
const HOME_INSTANCES = HOME ? ['s1', 's2', 's3'] : []; // home-channel instance ids (empty when there is no home-channel)

// Home-channel id column on the scratch table (raak: `project_id`), derived from config. Null on an
// org-only fork, where the read is org-wide and no home-channel column is ever referenced.
const homeIdKey = HOME ? appConfig.entityIdColumnKeys[HOME] : null; // 'projectId' | null
const homeColumnName = homeIdKey ? toColumnName(homeIdKey) : null; // 'project_id' | null

// Root id column ('organizationId'): forks that configure `elevatedRoles` compile
// home-scoped grants against it, so the scratch table must carry it like real product
// tables do (on the template config it is simply never referenced).
const rootIdKey = appConfig.entityIdColumnKeys[ROOT];
const rootColumnName = toColumnName(rootIdKey);

/** Scratch table (real Postgres, admin connection): the minimal shape of a product table. */
const baseColumns = {
  id: varchar('id').primaryKey(),
  createdBy: varchar('created_by'),
  // Public readability, denormalized onto the row exactly as `productColumns` carries it.
  publicAt: varchar('public_at'),
  [rootIdKey]: varchar(rootColumnName).notNull(),
};
const parityTable = pgTable(
  'test_permission_parity_rows',
  homeIdKey && homeColumnName ? { ...baseColumns, [homeIdKey]: varchar(homeColumnName).notNull() } : baseColumns,
);
// The home-channel column passed to `buildCollectionReadWhere`. On an org-only fork the read is
// org-wide (homeChannelIds always undefined/[]), so this column is never referenced; `id` stands in.
const homeChannelColumn = (
  homeIdKey ? (parityTable as unknown as Record<string, PgColumn>)[homeIdKey] : parityTable.id
) as PgColumn;

const USERS = ['u1', 'u2'] as const;

const PUBLIC_AT = '2026-07-06T12:00:00Z';

interface ParityRow {
  id: string;
  homeChannelId: string | null;
  createdBy: string | null;
  publicAt: string | null;
}

/** Fixed row set: every home-channel (or the single org) × creator × published-or-not. */
const HOME_SLOTS: (string | null)[] = HOME ? HOME_INSTANCES : [null];
const ROWS: ParityRow[] = HOME_SLOTS.flatMap((homeChannelId) =>
  [...USERS, null].flatMap((createdBy) =>
    [null, PUBLIC_AT].map((publicAt) => ({
      id: `${homeChannelId ?? 'root'}:${createdBy ?? 'nobody'}:${publicAt ? 'public' : 'private'}`,
      homeChannelId,
      createdBy,
      publicAt,
    })),
  ),
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
const randomReadValue = (random: () => number): PolicyCellInput => pick(random, [0, 1, 'own'] as const);

/** Policies for `attachment` with random read cells for every channel × role in the real chain. */
const randomPolicies = (random: () => number): PolicyMatrix =>
  configurePolicyMatrix(appConfig.entityTypes, ({ entityType, channels }) => {
    if (entityType !== 'attachment') return;
    const builders = channels as unknown as Record<string, Record<string, (perms: { read: PolicyCellInput }) => void>>;
    for (const ctx of CHAIN) {
      for (const role of hierarchy.getRoles(ctx)) {
        builders[ctx][role]({ read: randomReadValue(random) });
      }
    }
  });

interface Scenario {
  policies: PolicyMatrix;
  memberships: MembershipBaseModel[];
  userId: string | undefined;
  isSystemAdmin: boolean;
  /** Public read grant for `attachment`, or none. */
  publicGrants: PublicReadGrants;
}

/** The scenario's actor, in the shape every enforcement path now demands. */
const scenarioActor = (scenario: Scenario): Actor =>
  scenario.userId === undefined
    ? { anonymous: true }
    : { userId: scenario.userId, isSystemAdmin: scenario.isSystemAdmin };

const membership = (channelType: ChannelEntityType, channelId: string, role: string): MembershipBaseModel =>
  ({
    id: `mem-${channelType}-${channelId}-${role}`,
    userId: 'actor',
    channelType,
    channelId,
    organizationId: ROOT_ID,
    role,
  }) as unknown as MembershipBaseModel;

/** A public read grant on `attachment`, in ~30% of scenarios. */
const randomPublicGrants = (random: () => number): PublicReadGrants => (random() < 0.3 ? { attachment: true } : {});

const randomScenario = (random: () => number): Scenario => {
  const anonymous = random() < 0.1;
  if (anonymous) {
    return {
      policies: randomPolicies(random),
      memberships: [],
      userId: undefined,
      // The actor union makes an anonymous system administrator unrepresentable.
      isSystemAdmin: false,
      publicGrants: randomPublicGrants(random),
    };
  }

  const memberships: MembershipBaseModel[] = [];
  if (random() < 0.4) memberships.push(membership(ROOT, ROOT_ID, pick(random, hierarchy.getRoles(ROOT))));
  if (HOME) {
    for (const subId of HOME_INSTANCES) {
      if (random() < 0.4) memberships.push(membership(HOME, subId, pick(random, hierarchy.getRoles(HOME))));
    }
  }
  return {
    policies: randomPolicies(random),
    memberships,
    userId: pick(random, USERS),
    // System administrators may have no membership; collection access must still match row access.
    isSystemAdmin: random() < 0.15,
    publicGrants: randomPublicGrants(random),
  };
};

const rowSubject = (row: ParityRow): SubjectForPermission => ({
  entityType: 'attachment',
  id: row.id,
  createdBy: row.createdBy,
  channelIds: { [ROOT]: ROOT_ID, ...(HOME && row.homeChannelId !== null ? { [HOME]: row.homeChannelId } : {}) },
  // Row data every row-derived rule reads: `'own'` via createdBy, public read via publicAt.
  row: { createdBy: row.createdBy, publicAt: row.publicAt },
});

/** Path 1: the engine's per-row read decision. */
const engineReadableIds = (scenario: Scenario): Set<string> => {
  const readable = new Set<string>();
  for (const row of ROWS) {
    const { can } = getAllDecisions(scenario.policies, scenario.memberships, rowSubject(row), {
      userId: scenario.userId,
      isSystemAdmin: scenario.isSystemAdmin,
      publicGrants: scenario.publicGrants,
    });
    if (can.read) readable.add(row.id);
  }
  return readable;
};

/** Path 2: the compiled SQL predicate executed against Postgres. */
const sqlReadableIds = async (scenario: Scenario): Promise<Set<string>> => {
  const filter = resolveCollectionReadFilterForPolicies({
    policies: scenario.policies,
    memberships: scenario.memberships,
    entityType: 'attachment',
    organizationId: ROOT_ID,
    actor: scenarioActor(scenario),
    publicGrants: scenario.publicGrants,
  });
  const where = buildCollectionReadWhere(filter, parityTable, homeChannelColumn, scenarioActor(scenario));

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
      created_by varchar,
      public_at varchar,
      ${rootColumnName} varchar not null${homeColumnName ? `,\n      ${homeColumnName} varchar not null` : ''}
    )
  `),
  );
  const values = ROWS.map((r) => ({
    id: r.id,
    createdBy: r.createdBy,
    publicAt: r.publicAt,
    [rootIdKey]: ROOT_ID,
    ...(homeIdKey && r.homeChannelId !== null ? { [homeIdKey]: r.homeChannelId } : {}),
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
        .map((m) => `${m.channelType}:${m.channelId}:${m.role}`)
        .join(', ')}; user: ${scenario.userId ?? 'anonymous'}; sysadmin: ${scenario.isSystemAdmin}; public: ${
        scenario.publicGrants.attachment ?? 'none'
      })`;

      // Engine ⊆⊇ SQL: identical readable row sets.
      const fromEngine = engineReadableIds(scenario);
      const fromSql = await sqlReadableIds(scenario);
      expect(fromSql, label).toEqual(fromEngine);

      // Compare frontend and engine decisions per membership and in-scope row.
      // Both sides omit system-admin and public grants because `computeCan` models one membership.
      for (const m of scenario.memberships) {
        const canMap = computeCan(m.channelType as ChannelEntityType, m, scenario.policies);
        const state = canMap.attachment?.read ?? false;
        const rowsInScope = m.channelType === ROOT ? ROWS : ROWS.filter((r) => r.homeChannelId === m.channelId);

        for (const row of rowsInScope) {
          const resolved = resolveCan(state, row.createdBy, scenario.userId);
          const { can } = getAllDecisions(scenario.policies, [m], rowSubject(row), { userId: scenario.userId });
          expect(resolved, `${label}; membership ${m.channelType}:${m.channelId}:${m.role}; row ${row.id}`).toBe(
            can.read,
          );
        }
      }
    }
  });

  // Explicit home-channel narrowing needs a nested channel (e.g. organization > project). Skips on an
  // org-only fork, which has no home-channel to narrow into.
  describe.runIf(HOME !== null)('home-channel narrowing', () => {
    it('explicitly requested home-channel narrows conditional scopes the same way', async () => {
      const random = mulberry32(0xbee5);

      for (let i = 0; i < 100; i++) {
        const scenario = randomScenario(random);
        const requestedHomeChannel = pick(random, HOME_INSTANCES);

        let filter: ReturnType<typeof resolveCollectionReadFilterForPolicies>;
        try {
          filter = resolveCollectionReadFilterForPolicies({
            policies: scenario.policies,
            memberships: scenario.memberships,
            entityType: 'attachment',
            organizationId: ROOT_ID,
            actor: scenarioActor(scenario),
            publicGrants: scenario.publicGrants,
            requested: { homeChannelId: requestedHomeChannel },
          });
        } catch {
          // 403: no scope at all for the requested home-channel. The engine must agree that
          // no row of it is readable.
          const fromEngine = engineReadableIds(scenario);
          for (const row of ROWS.filter((r) => r.homeChannelId === requestedHomeChannel)) {
            expect(fromEngine.has(row.id), `seed 0xbee5 scenario ${i} row ${row.id}`).toBe(false);
          }
          continue;
        }

        const where = buildCollectionReadWhere(filter, parityTable, homeChannelColumn, scenarioActor(scenario));
        const fromSqlAll =
          where.kind === 'none'
            ? new Set<string>()
            : new Set(
                (where.kind === 'all'
                  ? await seedDb.select({ id: parityTable.id }).from(parityTable)
                  : await seedDb.select({ id: parityTable.id }).from(parityTable).where(where.where)
                ).map((r) => r.id),
              );

        // Narrowed SQL result == engine-readable rows of the requested home-channel.
        const fromEngine = engineReadableIds(scenario);
        const expected = new Set(
          ROWS.filter((r) => r.homeChannelId === requestedHomeChannel && fromEngine.has(r.id)).map((r) => r.id),
        );
        expect(fromSqlAll, `seed 0xbee5 scenario ${i} home-channel ${requestedHomeChannel}`).toEqual(expected);
      }
    });
  });
});

// The shared deep fixture exercises intermediate ancestor grants. Both the engine and
// scope compiler receive its hierarchy through their hierarchy-override seam.
const DEEP_ITEM = 'item' as unknown as ProductEntityType;

// Column keys follow the `${channelType}Id` convention `buildCollectionReadWhere` falls
// back to for hierarchy levels absent from `appConfig.entityIdColumnKeys`.
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

const deepMembership = (channelType: DeepChannelType, channelId: string, role: string): MembershipBaseModel =>
  ({
    id: `mem-${channelType}-${channelId}-${role}`,
    userId: 'actor',
    channelType,
    channelId,
    organizationId: ROOT_ID,
    role,
  }) as unknown as MembershipBaseModel;

interface DeepScenario {
  policies: PolicyMatrix;
  memberships: MembershipBaseModel[];
  userId: string | undefined;
}

const randomDeepScenario = (random: () => number): DeepScenario => {
  const memberships: MembershipBaseModel[] = [];
  if (random() < 0.5)
    memberships.push(deepMembership('organization', ROOT_ID, pick(random, deepChannelRoles.organization)));
  if (random() < 0.5) memberships.push(deepMembership('course', 'c1', pick(random, deepChannelRoles.course)));
  if (random() < 0.3) memberships.push(deepMembership('course', 'c2', pick(random, deepChannelRoles.course)));
  if (random() < 0.5)
    memberships.push(deepMembership('courseSection', 's1', pick(random, deepChannelRoles.courseSection)));
  if (random() < 0.5) memberships.push(deepMembership('project', 'p1', pick(random, deepChannelRoles.project)));
  if (random() < 0.3) memberships.push(deepMembership('project', 'p3', pick(random, deepChannelRoles.project)));
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
    channelIds: {
      organization: ROOT_ID,
      course: row.courseId,
      courseSection: row.courseSectionId,
      project: row.projectId,
    },
  }) as unknown as SubjectForPermission;

/** Path 1: the engine's per-row read decision, over the synthetic hierarchy. */
const deepEngineReadableIds = (scenario: DeepScenario, elevatedRoles?: readonly string[]): Set<string> => {
  const readable = new Set<string>();
  for (const row of DEEP_ROWS) {
    const { can } = getAllDecisions(scenario.policies, scenario.memberships, deepRowSubject(row), {
      userId: scenario.userId,
      ...deepOverrides,
      ...(elevatedRoles && { elevatedRoles }),
    });
    if (can.read) readable.add(row.id);
  }
  return readable;
};

/** The deep scenario's actor. Deep chains exercise scope, not the admin bypass. */
const deepActor = (scenario: DeepScenario): Actor =>
  scenario.userId === undefined ? { anonymous: true } : { userId: scenario.userId, isSystemAdmin: false };

/** Path 2: the compiled SQL predicate executed against Postgres, same hierarchy. */
const deepSqlReadableIds = async (scenario: DeepScenario, elevatedRoles?: readonly string[]): Promise<Set<string>> => {
  const filter = resolveCollectionReadFilterForPolicies({
    policies: scenario.policies,
    memberships: scenario.memberships,
    entityType: DEEP_ITEM,
    organizationId: ROOT_ID,
    actor: deepActor(scenario),
    elevatedRoles,
    ...deepOverrides,
  });
  const where = buildCollectionReadWhere(filter, deepParityTable, deepParityTable.projectId, deepActor(scenario));

  if (where.kind === 'none') return new Set();
  const query = seedDb.select({ id: deepParityTable.id }).from(deepParityTable);
  const rows = where.kind === 'all' ? await query : await query.where(where.where);
  return new Set(rows.map((r) => r.id));
};

const deepScenarioLabel = (seed: string, i: number, scenario: DeepScenario): string =>
  `seed ${seed} scenario ${i} (memberships: ${scenario.memberships
    .map((m) => `${m.channelType}:${m.channelId}:${m.role}`)
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

  // Sysadmin widens who can read, never what a placement-filtered list returns. The
  // admin bypass must preserve `requested` narrowing.
  it('an explicitly requested home-channel narrows a sysadmin read like any other', async () => {
    const sysadmin: Actor = { userId: 'u1', isSystemAdmin: true };
    const sqlIdsFor = async (requested: { homeChannelId?: string; homeChannelIds?: string[] }) => {
      const filter = resolveCollectionReadFilterForPolicies({
        policies: deepPolicies(() => 0),
        memberships: [],
        entityType: DEEP_ITEM,
        organizationId: ROOT_ID,
        actor: sysadmin,
        ...deepOverrides,
        requested,
      });
      const where = buildCollectionReadWhere(filter, deepParityTable, deepParityTable.projectId, sysadmin);
      if (where.kind === 'none') return new Set<string>();
      const query = seedDb.select({ id: deepParityTable.id }).from(deepParityTable);
      const rows = where.kind === 'all' ? await query : await query.where(where.where);
      return new Set(rows.map((r) => r.id));
    };
    const homedAt = (...projectIds: string[]) =>
      new Set(DEEP_ROWS.filter((r) => r.projectId !== null && projectIds.includes(r.projectId)).map((r) => r.id));

    expect(await sqlIdsFor({ homeChannelId: 'p1' })).toEqual(homedAt('p1'));
    expect(await sqlIdsFor({ homeChannelIds: ['p1', 'p2'] })).toEqual(homedAt('p1', 'p2'));
  });
});

const SUBTREE_ROLES = ['admin', 'staff'] as const;

// Non-elevated product roles see rows homed at their grant level; elevated roles retain
// subtree scope. This synthetic chain covers configs that enable `elevatedRoles`.
describe('elevatedRoles parity: home-scoped grants agree between engine and SQL', () => {
  it('agrees on every row across random policies and memberships with elevatedRoles configured', async () => {
    const random = mulberry32(0x50b7);

    for (let i = 0; i < 100; i++) {
      const scenario = randomDeepScenario(random);
      const label = deepScenarioLabel('0x50b7', i, scenario);

      const fromEngine = deepEngineReadableIds(scenario, SUBTREE_ROLES);
      const fromSql = await deepSqlReadableIds(scenario, SUBTREE_ROLES);
      expect(fromSql, label).toEqual(fromEngine);
    }
  });

  it('scopes a non-elevated course grant to course-HOMED rows only', async () => {
    const scenario: DeepScenario = {
      policies: deepPolicies((channelType, role) => (channelType === 'course' && role === 'student' ? 1 : 0)),
      memberships: [deepMembership('course', 'c1', 'student')],
      userId: 'u1',
    };
    // Rows homed at c1 itself, excluding section/project rows physically below it.
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
      policies: deepPolicies((channelType, role) => (channelType === 'course' && role === 'staff' ? 1 : 0)),
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
      policies: deepPolicies((channelType, role) => (channelType === 'course' && role === 'student' ? 'own' : 0)),
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

// Real-config scenarios must agree across collection SQL, single-row checks, and SSE
// dispatch. The attachment ancestor chain and system-admin state define the scenario space.
const realMembership = (
  channelType: ChannelEntityType,
  channelId: string,
  role: string,
  organizationId: string,
): MembershipBaseModel =>
  ({
    id: `mem-${channelType}-${channelId}-${role}`,
    userId: 'actor',
    channelType,
    channelId,
    organizationId,
    role,
  }) as unknown as MembershipBaseModel;

const randomRealScenario = (
  random: () => number,
): { memberships: MembershipBaseModel[]; userId: string; isSystemAdmin: boolean } => {
  const memberships: MembershipBaseModel[] = [];
  if (random() < 0.5) memberships.push(realMembership(ROOT, ROOT_ID, pick(random, hierarchy.getRoles(ROOT)), ROOT_ID));
  // A grant in a DIFFERENT org must contribute nothing to this org's collection
  if (random() < 0.3)
    memberships.push(realMembership(ROOT, 'org-other', pick(random, hierarchy.getRoles(ROOT)), 'org-other'));
  if (HOME) {
    for (const subId of HOME_INSTANCES) {
      if (random() < 0.4)
        memberships.push(realMembership(HOME, subId, pick(random, hierarchy.getRoles(HOME)), ROOT_ID));
    }
  }
  // SSE subscribers are always authenticated; 'outsider' stands in for a user with no rows
  return {
    memberships,
    userId: random() < 0.85 ? pick(random, USERS) : 'outsider',
    isSystemAdmin: random() < 0.15,
  };
};

/** Channel id columns as they appear on an activity event (and its row). */
const rowChannelColumns = (row: ParityRow): Record<string, unknown> => ({
  [appConfig.entityIdColumnKeys[ROOT]]: ROOT_ID,
  ...(homeIdKey ? { [homeIdKey]: row.homeChannelId } : {}),
});

const dispatchEvent = (row: ParityRow): AppStreamProductEvent =>
  ({
    entityType: 'attachment',
    subjectId: row.id,
    ...rowChannelColumns(row),
    rowData: { id: row.id, createdBy: row.createdBy, publicAt: row.publicAt, ...rowChannelColumns(row) },
  }) as unknown as AppStreamProductEvent;

describe('three-way mirror parity: SQL ≍ engine ≍ dispatch under the real app config', () => {
  it('agrees on every row for random membership sets and actors', async () => {
    const random = mulberry32(0x3a11);

    for (let i = 0; i < 100; i++) {
      const { memberships, userId, isSystemAdmin } = randomRealScenario(random);
      const label = `seed 0x3a11 scenario ${i} (memberships: ${memberships
        .map((m) => `${m.channelType}:${m.channelId}:${m.role}`)
        .join(', ')}; user: ${userId}; sysadmin: ${isSystemAdmin})`;

      const actor: Actor = { userId, isSystemAdmin };

      const filter = resolveCollectionReadFilter(memberships, 'attachment', ROOT_ID, actor);
      const where = buildCollectionReadWhere(filter, parityTable, homeChannelColumn, actor);
      const query = seedDb.select({ id: parityTable.id }).from(parityTable);
      const fromSql = new Set(
        where.kind === 'none'
          ? []
          : (where.kind === 'all' ? await query : await query.where(where.where)).map((r) => r.id),
      );

      for (const row of ROWS) {
        // Same subject shape dispatch builds: ancestor scope + the row itself
        const subject = rowSubject(row);
        const engineAllowed = checkAccess({ userId, isSystemAdmin, memberships }, 'read', subject).allowed;
        const dispatchAllowed = canReceiveProductEvent({ userId, isSystemAdmin, memberships }, dispatchEvent(row));

        expect(dispatchAllowed, `${label} → row ${row.id} dispatch-vs-engine`).toBe(engineAllowed);
        expect(fromSql.has(row.id), `${label} → row ${row.id} sql-vs-engine`).toBe(engineAllowed);
      }
    }
  });
});
