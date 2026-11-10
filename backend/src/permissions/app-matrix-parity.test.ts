import { sql } from 'drizzle-orm';
import { boolean, pgTable, varchar } from 'drizzle-orm/pg-core';
import {
  type Access,
  type EntityHierarchy,
  getAllDecisions,
  type PolicyCellInput,
  type PolicyMatrix,
  type ProductEntityType,
  type PublicReadGrants,
  type SubjectForPermission,
} from 'shared';
import { coursesMatrixFixture, type MatrixFixture, projectsMatrixFixture } from 'shared/testing/app-matrices';
import { configurePolicyMatrix } from 'shared/testing/policies';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '#/core/error';
import { getSeedDb } from '#/db/db';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { resolveCollectionReadFilter } from './collection-scope';
import { buildCollectionReadWhere } from './row-predicates';

const seedDb = getSeedDb();

const rootId = 'org1';
const users = ['u1', 'u2'];
const idsAt = (level: string) => [`${level}-1`, `${level}-2`];

// One column per channel level the two fixtures' products live under.
const table = pgTable('test_app_matrix_rows', {
  id: varchar('id').primaryKey(),
  organizationId: varchar('organization_id').notNull(),
  courseId: varchar('course_id'),
  courseSectionId: varchar('course_section_id'),
  projectId: varchar('project_id'),
  createdBy: varchar('created_by'),
  public: boolean('public').notNull().default(false),
});

interface Row {
  id: string;
  /** Ancestor id per level, null where the row leaves the level unset. */
  chain: Record<string, string | null>;
  createdBy: string | null;
  public: boolean;
}

/** Every placement of a product: each subset of its levels below the organization, all on the first or second id. */
const rowsOf = (hierarchy: EntityHierarchy, product: string): Row[] => {
  const levels = hierarchy.getOrderedAncestors(product).filter((level) => level !== 'organization');
  return Array.from({ length: 1 << levels.length }, (_, mask) => mask).flatMap((mask) =>
    [0, 1].flatMap((idIndex) => {
      const chain: Record<string, string | null> = { organization: rootId };
      levels.forEach((level, i) => {
        chain[level] = (mask >> i) & 1 ? (idsAt(level)[idIndex] ?? null) : null;
      });
      return [...users, null].flatMap((createdBy) =>
        [false, true].map((isPublic) => ({ id: `${mask}.${idIndex}:${createdBy ?? 'none'}:${isPublic}`, chain, createdBy, public: isPublic })),
      );
    }),
  );
};

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

interface Scenario {
  policies: PolicyMatrix;
  publicGrants: PublicReadGrants;
  access: Access<MembershipBaseModel>;
  label: string;
}

/** The fixture's matrix in half the scenarios, random read cells over its hierarchy in the rest. */
const randomScenario = (random: () => number, { hierarchy, permissions }: MatrixFixture, product: string, i: number): Scenario => {
  const chain = hierarchy.getOrderedAncestors(product);
  const real = random() < 0.5;
  const policies = real
    ? permissions.policyMatrix
    : configurePolicyMatrix(
        // The matrix builder is typed by the app's entities and roles; the fixture vocabulary is cast to them.
        hierarchy.allTypes as never,
        (({ entityType, channels }: { entityType: string; channels: Record<string, Record<string, (cells: object) => void>> }) => {
          if (entityType !== product) return;
          for (const level of chain)
            for (const role of hierarchy.getRoles(level)) channels[level]?.[role]?.({ read: pick(random, [0, 1, 'own'] as PolicyCellInput[]) });
        }) as never,
        { hierarchy },
      );
  const publicGrants = real ? permissions.publicReadGrants : ((random() < 0.3 ? { [product]: true } : {}) as PublicReadGrants);

  // The fixture's channel types are not the app's, so a membership row of them is cast.
  const membership = (channelType: string, channelId: string, organizationId = rootId) =>
    ({
      id: `${channelType}:${channelId}`,
      userId: 'actor',
      channelType,
      channelId,
      organizationId,
      role: pick(random, hierarchy.getRoles(channelType)),
    }) as unknown as MembershipBaseModel;
  const memberships: MembershipBaseModel[] = [];
  if (random() < 0.5) memberships.push(membership('organization', rootId));
  if (random() < 0.2) memberships.push(membership('organization', 'org-other', 'org-other'));
  for (const level of hierarchy.channelTypes) {
    if (level === 'organization') continue;
    for (const id of idsAt(level)) if (random() < (chain.includes(level) ? 0.35 : 0.15)) memberships.push(membership(level, id));
  }

  const anonymous = random() < 0.08;
  const access: Access<MembershipBaseModel> = anonymous
    ? { visitor: true }
    : { actorId: pick(random, users), isSystemAdmin: random() < 0.08, memberships, scopes: null };
  const holds = memberships.map((m) => `${m.channelType}:${m.channelId}:${m.role}`).join(', ');
  return {
    policies,
    publicGrants,
    access,
    label: `${product} scenario ${i} (${real ? 'matrix' : 'random cells'}; ${anonymous ? 'anonymous' : holds})`,
  };
};

beforeAll(async () => {
  await seedDb.execute(sql`drop table if exists test_app_matrix_rows`);
  await seedDb.execute(sql`
    create table test_app_matrix_rows (
      id varchar primary key, organization_id varchar not null, course_id varchar, course_section_id varchar,
      project_id varchar, created_by varchar, public boolean not null default false
    )
  `);
});

afterAll(async () => {
  await seedDb.execute(sql`drop table if exists test_app_matrix_rows`);
});

// The hierarchies only apps declare: intermediate, home-scoped and conditional read scopes arise from them alone.
describe.each([projectsMatrixFixture, coursesMatrixFixture])('$name matrix: compiled SQL ≍ engine', (fixture) => {
  const { hierarchy } = fixture;

  it.each(hierarchy.productTypes)('agrees on every %s row, and a narrowed list never reads more than the engine', async (product) => {
    const rows = rowsOf(hierarchy, product);
    await seedDb.execute(sql`delete from test_app_matrix_rows`);
    await seedDb.insert(table).values(
      rows.map(({ id, chain, createdBy, public: isPublic }) => ({
        id,
        organizationId: rootId,
        createdBy,
        public: isPublic,
        ...Object.fromEntries(Object.entries(chain).map(([level, channelId]) => [`${level}Id`, channelId])),
      })),
    );

    const parent = hierarchy.getOrderedAncestors(product)[0] ?? 'organization';
    const random = mulberry32(0xa995 + product.length);

    for (let i = 0; i < 100; i++) {
      const { policies, publicGrants, access, label } = randomScenario(random, fixture, product, i);
      const rules = { policies, publicGrants, hierarchy };
      const actor = 'visitor' in access ? {} : { actorId: access.actorId, isSystemAdmin: access.isSystemAdmin };

      const engineRows = rows.filter((row) => {
        // The fixture's entity types are not the app's, so its subject is cast.
        const subject = { entityType: product, id: row.id, createdBy: row.createdBy, channelIds: row.chain, row } as unknown as SubjectForPermission;
        return getAllDecisions(policies, 'visitor' in access ? [] : access.memberships, subject, { ...actor, publicGrants, hierarchy }).can.read;
      });

      const sqlIds = async (requested?: { homeChannelId: string }) => {
        const filter = resolveCollectionReadFilter(access, product as ProductEntityType, rootId, requested, rules);
        const where = buildCollectionReadWhere(filter, table, access);
        if (where.kind === 'none') return [];
        const query = seedDb.select({ id: table.id }).from(table);
        return (where.kind === 'all' ? await query : await query.where(where.where)).map(({ id }) => id).sort();
      };

      expect(await sqlIds(), label).toEqual(engineRows.map(({ id }) => id).sort());

      if (parent === 'organization') continue;
      for (const homeChannelId of [...idsAt(parent), `${parent}-unknown`]) {
        const readable = new Set(engineRows.filter((row) => row.chain[parent] === homeChannelId).map(({ id }) => id));
        // A home channel outside the readable scope answers 404, which reads nothing.
        const narrowed = await sqlIds({ homeChannelId }).catch((error: unknown) => {
          if (error instanceof AppError && error.status === 404) return [];
          throw error;
        });
        expect(
          narrowed.filter((id) => !readable.has(id)),
          `${label}; narrowed to ${homeChannelId}`,
        ).toEqual([]);
      }
    }
  });
});
