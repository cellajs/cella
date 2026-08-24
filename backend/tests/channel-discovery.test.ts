import { and, eq, type SQL, sql } from 'drizzle-orm';
import { boolean, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { Actor, ChannelEntityType, EntityHierarchy, EntityType, PolicyMatrix } from 'shared';
import { deepEntityTypes, deepHierarchy, deepOverrides } from 'shared/testing/deep-fixture';
import { configurePolicyMatrix } from 'shared/testing/policies';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { seedDb } from '#/db/db';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import {
  buildChannelListReadWhere,
  type ChannelListReadColumns,
  excludeArchivedWhere,
  resolveChannelCollectionReadScopeForPolicies,
} from '#/permissions/channel-collection-scope';

/**
 * Aggregate channel lists return readable non-membered "discovery" rows next to membered rows.
 * Cella's default config has no sub-organization channel type, so the list shape is exercised on
 * scratch tables against the shared deep fixture, with the membership join wired exactly as a
 * consuming list query must wire it (see `buildChannelListReadWhere`).
 */
const ORG_ID = 'org-1';
const CHANNEL_TYPE = 'project' as Exclude<ChannelEntityType, 'organization'>;

// Discovery matrix: org admins manage everything, plain org members get create-only (no blanket read),
// course staff manage (drafts included), course students read published rows only.
const policies: PolicyMatrix = configurePolicyMatrix(
  deepEntityTypes as unknown as readonly EntityType[],
  ({ entityType, channels }) => {
    if ((entityType as string) !== 'project') return;
    const builders = channels as unknown as Record<string, Record<string, (perms: Record<string, 0 | 1>) => void>>;
    builders.organization.admin({ read: 1, update: 1 });
    builders.organization.member({ create: 1 });
    builders.course.staff({ read: 1, update: 1 });
    builders.course.student({ read: 1 });
  },
  deepOverrides,
);

/** Scratch channel table: the minimal shape of a sub-org channel row. */
const channelsTable = pgTable('test_channel_discovery_rows', {
  id: varchar('id').primaryKey(),
  organizationId: varchar('organization_id').notNull(),
  courseId: varchar('course_id'),
  publishedAt: varchar('published_at'),
});

/** Scratch membership table: the columns the list join and the scope resolver read. */
const membershipsTable = pgTable('test_channel_discovery_memberships', {
  id: varchar('id').primaryKey(),
  userId: varchar('user_id').notNull(),
  channelType: varchar('channel_type').notNull(),
  channelId: varchar('channel_id').notNull(),
  organizationId: varchar('organization_id').notNull(),
  role: varchar('role').notNull(),
  archived: boolean('archived').notNull().default(false),
});

const PUBLISHED_AT = '2026-08-01T00:00:00Z';

let rowCounter = 0;

const insertChannel = async (opts: { courseId?: string | null; published?: boolean } = {}) => {
  const id = `ch-${++rowCounter}`;
  await seedDb.insert(channelsTable).values({
    id,
    organizationId: ORG_ID,
    courseId: opts.courseId ?? null,
    publishedAt: opts.published === false ? null : PUBLISHED_AT,
  });
  return id;
};

const insertMembership = async (
  userId: string,
  channelType: string,
  channelId: string,
  role: string,
  opts: { archived?: boolean; organizationId?: string } = {},
) => {
  await seedDb.insert(membershipsTable).values({
    id: `mem-${++rowCounter}`,
    userId,
    channelType,
    channelId,
    organizationId: opts.organizationId ?? ORG_ID,
    role,
    archived: opts.archived ?? false,
  });
};

interface ListOpts {
  courseId?: string;
  role?: string;
  excludeArchived?: boolean;
  isSystemAdmin?: boolean;
}

interface ListedRow {
  id: string;
  membershipRole: string | null;
}

/** The list query as a consumer wires it: LEFT join for discovery, INNER join (filters in ON) once a role filter narrows to memberships. */
const listChannels = async (userId: string, opts: ListOpts = {}): Promise<ListedRow[]> => {
  const actor: Actor = { userId, isSystemAdmin: opts.isSystemAdmin ?? false };
  const memberships = (await seedDb
    .select()
    .from(membershipsTable)
    .where(eq(membershipsTable.userId, userId))) as unknown as MembershipBaseModel[]; // scratch rows carry the base shape

  const membershipKeyOn = and(
    eq(membershipsTable.channelId, channelsTable.id),
    eq(membershipsTable.channelType, CHANNEL_TYPE),
    eq(membershipsTable.userId, userId),
  );
  const membershipFilterOn = and(
    ...(opts.excludeArchived ? [eq(membershipsTable.archived, false)] : []),
    ...(opts.role ? [eq(membershipsTable.role, opts.role)] : []),
  );

  const readColumns: ChannelListReadColumns = {
    membershipUserId: membershipsTable.userId,
    publishedAt: channelsTable.publishedAt,
    // Keyed by a deep-fixture level the app's ChannelEntityType union does not know
    ancestorIdColumns: Object.fromEntries([['course', channelsTable.courseId]]),
    ...(opts.excludeArchived && { membershipArchived: membershipsTable.archived }),
  };

  // A role filter is a membership question: no discovery rows
  const discoveryScope = opts.role
    ? undefined
    : resolveChannelCollectionReadScopeForPolicies({
        policies,
        memberships,
        channelType: CHANNEL_TYPE,
        organizationId: ORG_ID,
        actor,
        hierarchy: deepHierarchy as unknown as EntityHierarchy,
      });
  const scopeWhere = discoveryScope ? buildChannelListReadWhere(discoveryScope, readColumns) : undefined;

  const where: SQL[] = [
    eq(channelsTable.organizationId, ORG_ID),
    ...(opts.courseId ? [eq(channelsTable.courseId, opts.courseId)] : []),
    ...(scopeWhere?.kind === 'where' ? [scopeWhere.where] : []),
    ...(discoveryScope ? [excludeArchivedWhere(readColumns)].filter((c): c is SQL => c !== undefined) : []),
  ];

  const source = seedDb.select({ id: channelsTable.id, membershipRole: membershipsTable.role }).from(channelsTable);
  const joined = discoveryScope
    ? source.leftJoin(membershipsTable, membershipKeyOn)
    : source.innerJoin(membershipsTable, and(membershipKeyOn, membershipFilterOn));
  return joined.where(and(...where));
};

const idsOf = (rows: ListedRow[]) => rows.map(({ id }) => id).sort();

beforeAll(async () => {
  await seedDb.execute(sql`drop table if exists test_channel_discovery_rows`);
  await seedDb.execute(sql`drop table if exists test_channel_discovery_memberships`);
  await seedDb.execute(sql`
    create table test_channel_discovery_rows (
      id varchar primary key,
      organization_id varchar not null,
      course_id varchar,
      published_at varchar
    )
  `);
  await seedDb.execute(sql`
    create table test_channel_discovery_memberships (
      id varchar primary key,
      user_id varchar not null,
      channel_type varchar not null,
      channel_id varchar not null,
      organization_id varchar not null,
      role varchar not null,
      archived boolean not null default false
    )
  `);
});

afterEach(async () => {
  await seedDb.delete(channelsTable);
  await seedDb.delete(membershipsTable);
});

afterAll(async () => {
  await seedDb.execute(sql`drop table if exists test_channel_discovery_rows`);
  await seedDb.execute(sql`drop table if exists test_channel_discovery_memberships`);
});

describe('Channel list discovery rows', () => {
  it('lets a course student discover published channels of the course, without membership data', async () => {
    await insertMembership('student', 'course', 'course-1', 'student');
    const foreign = await insertChannel({ courseId: 'course-1' });
    const own = await insertChannel({ courseId: 'course-1' });
    await insertMembership('student', 'project', own, 'owner');
    await insertChannel({ courseId: 'course-2' }); // outside the granted course

    const rows = await listChannels('student', { courseId: 'course-1' });
    expect(idsOf(rows)).toEqual([foreign, own].sort());

    // Membership data only on the membered row; the discovery row has none
    expect(rows.find(({ id }) => id === foreign)?.membershipRole).toBeNull();
    expect(rows.find(({ id }) => id === own)?.membershipRole).toBe('owner');

    // Unscoped org list: the other course's row stays out
    expect(idsOf(await listChannels('student'))).toEqual([foreign, own].sort());
  });

  it('hides draft discovery rows from read-only grants but shows them to managers', async () => {
    await insertMembership('student', 'course', 'course-1', 'student');
    await insertMembership('staff', 'course', 'course-1', 'staff');
    const published = await insertChannel({ courseId: 'course-1' });
    const draft = await insertChannel({ courseId: 'course-1', published: false });

    expect(idsOf(await listChannels('student', { courseId: 'course-1' }))).toEqual([published]);
    expect(idsOf(await listChannels('staff', { courseId: 'course-1' }))).toEqual([published, draft].sort());
  });

  it('keeps org-homed channels hidden from plain org members (create-only, no blanket read)', async () => {
    await insertMembership('member', 'organization', ORG_ID, 'member');
    await insertChannel(); // org-homed, not membered
    await insertChannel({ courseId: 'course-1' }); // course-homed, no course grant
    const own = await insertChannel();
    await insertMembership('member', 'project', own, 'follower');

    expect(idsOf(await listChannels('member'))).toEqual([own]);
  });

  it('lets org admins and system admins discover every channel including drafts', async () => {
    await insertMembership('admin', 'organization', ORG_ID, 'admin');
    const orgHomed = await insertChannel();
    const draft = await insertChannel({ courseId: 'course-1', published: false });
    const all = [orgHomed, draft].sort();

    expect(idsOf(await listChannels('admin'))).toEqual(all);
    expect(idsOf(await listChannels('sysadmin', { isSystemAdmin: true }))).toEqual(all);
  });

  it('ignores grants held in another organization', async () => {
    await insertMembership('outsider', 'organization', 'org-2', 'admin', { organizationId: 'org-2' });
    await insertMembership('outsider', 'course', 'course-1', 'staff', { organizationId: 'org-2' });
    await insertChannel({ courseId: 'course-1' });

    expect(await listChannels('outsider')).toEqual([]);
  });

  it('keeps role-filtered lists membership-scoped (no discovery rows)', async () => {
    await insertMembership('student', 'course', 'course-1', 'student');
    await insertChannel({ courseId: 'course-1' }); // discoverable, not membered
    const own = await insertChannel({ courseId: 'course-1' });
    await insertMembership('student', 'project', own, 'owner');

    expect(idsOf(await listChannels('student', { courseId: 'course-1', role: 'owner' }))).toEqual([own]);
    expect(await listChannels('student', { courseId: 'course-1', role: 'follower' })).toEqual([]);
  });

  it('hides an archived own membership under excludeArchived instead of showing it as a discovery row', async () => {
    await insertMembership('student', 'course', 'course-1', 'student');
    const archived = await insertChannel({ courseId: 'course-1' });
    await insertMembership('student', 'project', archived, 'owner', { archived: true });
    const foreign = await insertChannel({ courseId: 'course-1' });

    expect(idsOf(await listChannels('student', { courseId: 'course-1' }))).toEqual([archived, foreign].sort());
    expect(idsOf(await listChannels('student', { courseId: 'course-1', excludeArchived: true }))).toEqual([foreign]);
  });
});
