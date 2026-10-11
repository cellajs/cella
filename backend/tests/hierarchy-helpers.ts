import { sql } from 'drizzle-orm';
import type { CreateAttachmentsData } from 'sdk';
import { appConfig, hierarchy } from 'shared';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { getAdminDb } from '#/db/db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';

const quoteIdent = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/** Minimal shape needed to run raw SQL, satisfied by both `baseDb` and the admin connection. */
type ExecutableDb = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

/** Insert every intermediate context row the plan declares (the organization row is assumed to exist). */
export async function seedEntityHierarchy(
  db: ExecutableDb,
  plan: TestEntityHierarchyPlan,
  opts: { tenantId: string; createdBy: string; slugPrefix: string },
): Promise<void> {
  for (const row of plan.seedChannelRows) {
    // Every ancestor id column is NOT NULL on channel tables, so insert all of them.
    const ancestorNames = sql.join(
      row.ancestorColumns.map((column) => sql.raw(quoteIdent(column.columnName))),
      sql`, `,
    );
    const ancestorValues = sql.join(
      row.ancestorColumns.map((column) => sql`${column.id}`),
      sql`, `,
    );
    await db.execute(sql`
      INSERT INTO ${sql.raw(quoteIdent(row.tableName))}
        (id, tenant_id, entity_type, name, slug, created_by, ${ancestorNames})
      VALUES (
        ${row.id}, ${opts.tenantId}, ${row.channelType}, ${`${opts.slugPrefix} ${row.channelType}`},
        ${`${opts.slugPrefix}-${row.channelType}-${row.id.slice(0, 8)}`}, ${opts.createdBy}, ${ancestorValues}
      )
      ON CONFLICT (id) DO NOTHING
    `);
  }
}

/** Delete seeded context rows, children before parents. */
export async function cleanupEntityHierarchy(db: ExecutableDb, ...plans: TestEntityHierarchyPlan[]): Promise<void> {
  for (const row of plans.flatMap((plan) => plan.seedChannelRows).reverse()) {
    await db.execute(sql`DELETE FROM ${sql.raw(quoteIdent(row.tableName))} WHERE id = ${row.id}`);
  }
}

/**
 * Seeds, on the admin connection, the channels between an organization and where its attachments live, and returns
 * the plan: none in the template, whose attachments live in the organization itself. Rows home at the deepest strict
 * ancestor, the one place every app's hierarchy allows, so the plan leaves the nullable ancestor columns unset.
 */
export async function seedAttachmentHome(org: { id: string; tenantId: string }, createdBy: string) {
  const plan = buildTestEntityHierarchyPlan({ entityType: 'attachment', organizationId: org.id, makeChannelId: () => generateId() });
  const slugPrefix = `home-${nanoid(6)}`;
  await seedEntityHierarchy(getAdminDb('test setup'), plan, { tenantId: org.tenantId, createdBy, slugPrefix });
  const nullable = new Set<string>(hierarchy.getNullableAncestors('attachment').map((type) => appConfig.entityIdColumnKeys[type]));
  const channelIdColumns = Object.fromEntries(Object.entries(plan.channelIdColumns).filter(([key]) => !nullable.has(key)));
  return { ...plan, channelIdColumns };
}

/** The id column a create body names its home by: the deepest channel in the plan's columns, none when that is the organization. */
export function homeColumns(plan: TestEntityHierarchyPlan): Record<string, string> {
  const home = hierarchy
    .getOrderedAncestors(plan.entityType)
    .find((type) => type !== 'organization' && plan.channelIdColumns[appConfig.entityIdColumnKeys[type]]);
  if (!home) return {};
  const key = appConfig.entityIdColumnKeys[home];
  return { [key]: plan.channelIdColumns[key] };
}

/**
 * A create body for one attachment in the plan's home, its file under the organization's upload prefix; `fields` add or
 * replace body fields.
 */
export const attachmentBody = (
  id: string,
  plan: TestEntityHierarchyPlan,
  fields: Record<string, unknown> = {},
): CreateAttachmentsData['body'][number] =>
  ({
    id,
    filename: 'file.pdf',
    contentType: 'application/pdf',
    size: '1024',
    keys: { original: `${plan.channelIdsByType.organization}/uploads/${id}.pdf` },
    ...homeColumns(plan),
    stx: { mutationId: id, sourceId: 'test', fieldTimestamps: {} },
    ...fields,
  }) as CreateAttachmentsData['body'][number];

/** Inserts an attachment row `buildInsertableProduct` built, on the admin connection. */
export const insertAttachmentRow = (row: Record<string, unknown>) =>
  // buildInsertableProduct returns a config-derived Record, so the insert type needs a cast.
  getAdminDb('test setup')
    .insert(attachmentsTable)
    .values(row as typeof attachmentsTable.$inferInsert);
