import { sql } from 'drizzle-orm';
import { type PgColumn, pgTable, varchar } from 'drizzle-orm/pg-core';
import {
  type AccessPolicies,
  appConfig,
  type ContextEntityType,
  computeCan,
  configureAccessPolicies,
  getAllDecisions,
  getContextRoles,
  hierarchy,
  type PermissionValue,
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
