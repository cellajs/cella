import { sql } from 'drizzle-orm';
import { pgTable, varchar } from 'drizzle-orm/pg-core';
import {
  type AccessPolicies,
  appConfig,
  computeCan,
  configureAccessPolicies,
  getAllDecisions,
  type PermissionValue,
  type RowRestrictions,
  resolvePermission,
  type SubjectForPermission,
} from 'shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDb } from '#/db/db';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { resolveCollectionReadFilterForPolicies } from './collection-scope';
import { buildCollectionReadWhere } from './row-predicates';

/**
 * Check-form / SQL-form / compute-can parity property test — merge blocker.
 *
 * One policy definition drives three enforcement paths:
 * 1. the permission engine's per-subject decision (`getAllDecisions`),
 * 2. the compiled SQL row predicate for collection reads (`buildCollectionReadWhere`,
 *    executed against real Postgres here),
 * 3. the frontend `can` states (`computeCan` + `resolvePermission`).
 *
 * Any divergence between them is a security bug: a row readable via SQL but denied by
 * the engine leaks data; the reverse silently hides rows. This test generates random
 * policy sets (including row-conditional `'own'` grants and row restrictions),
 * memberships and actors, and asserts the paths agree row-for-row.
 *
 * Cella's chain (attachment → organization) is single-level, so sub-context scoping and
 * multi-level depth qualification are exercised by the raak fork's parity suite; this
 * one covers the org-level grants, conditions, restrictions and anonymous actors.
 */

/** Scratch table (real Postgres, admin connection): the minimal shape of a product table. */
const parityTable = pgTable('test_permission_parity_rows', {
  id: varchar('id').primaryKey(),
  createdBy: varchar('created_by'),
  visibilityDepth: varchar('visibility_depth'),
  audienceRoles: varchar('audience_roles').array(),
});

const USERS = ['u1', 'u2'] as const;
const ORG_ID = 'org1';

interface ParityRow {
  id: string;
  createdBy: string | null;
  visibilityDepth: string | null;
  audienceRoles: string[] | null;
}

/** Depth × audience combinations, incl. an unknown depth (not in attachment's chain). */
const VISIBILITY_COMBOS: Array<{ key: string; visibilityDepth: string | null; audienceRoles: string[] | null }> = [
  { key: 'open', visibilityDepth: null, audienceRoles: null },
  { key: 'org', visibilityDepth: 'organization', audienceRoles: null },
  { key: 'org-member', visibilityDepth: 'organization', audienceRoles: ['member'] },
  { key: 'admin-only', visibilityDepth: null, audienceRoles: ['admin'] },
  { key: 'unknown-depth', visibilityDepth: 'project', audienceRoles: ['member'] },
  { key: 'empty-roles', visibilityDepth: 'organization', audienceRoles: [] },
];

/** Fixed row set: every creator (each user + null) × visibility combination. */
const ROWS: ParityRow[] = [...USERS, null].flatMap((createdBy) =>
  VISIBILITY_COMBOS.map(({ key, visibilityDepth, audienceRoles }) => ({
    id: `${createdBy ?? 'nobody'}:${key}`,
    createdBy,
    visibilityDepth,
    audienceRoles,
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

/** Policies for `attachment` with random read cells for every role. */
const randomPolicies = (random: () => number): AccessPolicies =>
  configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
    if (subject.name !== 'attachment') return;
    contexts.organization.admin({ read: randomReadValue(random) });
    contexts.organization.member({ read: randomReadValue(random) });
  });

interface Scenario {
  policies: AccessPolicies;
  memberships: MembershipBaseModel[];
  userId: string | undefined;
  restrictions: RowRestrictions;
}

/** Random restriction config: none, depth-only, roles-only or both; exemption on or off. */
const randomRestrictions = (random: () => number): RowRestrictions => {
  const shape = pick(random, ['none', 'none', 'depth', 'roles', 'both', 'both'] as const);
  if (shape === 'none') return {};
  const exemptRoles = random() < 0.5 ? (['admin'] as const) : ([] as const);
  return {
    attachment: {
      ...(shape !== 'roles' && { depthColumn: 'visibilityDepth' }),
      ...(shape !== 'depth' && { rolesColumn: 'audienceRoles' }),
      exemptRoles,
    },
  };
};

const membership = (role: string): MembershipBaseModel =>
  ({
    id: `mem-organization-${ORG_ID}-${role}`,
    userId: 'actor',
    contextType: 'organization',
    contextId: ORG_ID,
    organizationId: ORG_ID,
    role,
  }) as unknown as MembershipBaseModel;

const randomScenario = (random: () => number): Scenario => {
  const anonymous = random() < 0.15;
  if (anonymous) {
    return {
      policies: randomPolicies(random),
      memberships: [],
      userId: undefined,
      restrictions: randomRestrictions(random),
    };
  }

  const memberships: MembershipBaseModel[] = [];
  if (random() < 0.8) memberships.push(membership(pick(random, ['admin', 'member'])));
  return {
    policies: randomPolicies(random),
    memberships,
    userId: pick(random, USERS),
    restrictions: randomRestrictions(random),
  };
};

const rowSubject = (row: ParityRow): SubjectForPermission => ({
  entityType: 'attachment',
  id: row.id,
  createdBy: row.createdBy,
  contextIds: { organization: ORG_ID },
  row: { visibilityDepth: row.visibilityDepth, audienceRoles: row.audienceRoles },
});

/** Path 1: the engine's per-row read decision. */
const engineReadableIds = (scenario: Scenario): Set<string> => {
  const readable = new Set<string>();
  for (const row of ROWS) {
    const { can } = getAllDecisions(scenario.policies, scenario.memberships, rowSubject(row), {
      userId: scenario.userId,
      restrictions: scenario.restrictions,
    });
    if (can.read) readable.add(row.id);
  }
  return readable;
};

/** Path 2: the compiled SQL predicate executed against Postgres. */
const sqlReadableIds = async (scenario: Scenario): Promise<Set<string>> => {
  const filter = resolveCollectionReadFilterForPolicies(
    scenario.policies,
    scenario.memberships,
    'attachment',
    ORG_ID,
    undefined,
    scenario.restrictions,
  );
  // Single-level chain: scopes are org-wide or nothing, so the sub-context column is never
  // referenced by the compiled predicate; pass the id column to satisfy the signature.
  const where = buildCollectionReadWhere(filter, parityTable, parityTable.id, scenario.userId);

  if (where.kind === 'none') return new Set();
  const query = seedDb.select({ id: parityTable.id }).from(parityTable);
  const rows = where.kind === 'all' ? await query : await query.where(where.where);
  return new Set(rows.map((r) => r.id));
};

beforeAll(async () => {
  await seedDb.execute(sql`drop table if exists test_permission_parity_rows`);
  await seedDb.execute(sql`
    create table test_permission_parity_rows (
      id varchar primary key,
      created_by varchar,
      visibility_depth varchar,
      audience_roles varchar[]
    )
  `);
  await seedDb.insert(parityTable).values(ROWS);
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
      // match the engine's decision for every row.
      // KNOWN LIMITATION: computeCan is restriction-blind (context-level, no row data) —
      // restricted entities must resolve per row via the decision API, so parity with
      // compute-can is only asserted when no restriction is declared.
      if (scenario.restrictions.attachment) continue;
      for (const m of scenario.memberships) {
        const canMap = computeCan('organization', m, scenario.policies);
        const state = canMap.attachment?.read ?? false;

        for (const row of ROWS) {
          const resolved = resolvePermission(state, row.createdBy, scenario.userId);
          const { can } = getAllDecisions(scenario.policies, [m], rowSubject(row), { userId: scenario.userId });
          expect(resolved, `${label}; membership ${m.contextType}:${m.contextId}:${m.role}; row ${row.id}`).toBe(
            can.read,
          );
        }
      }
    }
  });
});
