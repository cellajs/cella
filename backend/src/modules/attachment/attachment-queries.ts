import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { AuthContext, DbContext } from '#/core/context';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { productCountersTable } from '#/modules/entities/product-counters-db';

interface FindAttachmentsByStxMutationIdOpts {
  mutationId: string;
}

/** Find attachments by their STX mutation ID (idempotency check). */
export const findAttachmentsByStxMutationId = async (
  ctx: AuthContext,
  { mutationId }: FindAttachmentsByStxMutationIdOpts,
) => {
  const { db, organizationId } = ctx.var;
  return db
    .select()
    .from(attachmentsTable)
    .where(
      and(
        sql`${attachmentsTable.stx}->>'mutationId' = ${mutationId}`,
        eq(attachmentsTable.organizationId, organizationId),
      ),
    );
};

/** Insert attachments and return the created records. Silently skips duplicates (PK conflict). */
export const insertAttachments = async (
  ctx: DbContext,
  { attachments }: { attachments: (typeof attachmentsTable.$inferInsert)[] },
) => {
  const { db } = ctx.var;
  return db.insert(attachmentsTable).values(attachments).onConflictDoNothing().returning();
};

interface UpdateAttachmentOpts {
  id: string;
  values: Partial<typeof attachmentsTable.$inferInsert>;
}

/** Update an attachment by ID and return the updated record. */
export const updateAttachment = async (ctx: AuthContext, { id, values }: UpdateAttachmentOpts) => {
  const { db, organizationId } = ctx.var;
  const [updated] = await db
    .update(attachmentsTable)
    .set(values)
    .where(and(eq(attachmentsTable.id, id), eq(attachmentsTable.organizationId, organizationId)))
    .returning();
  return updated;
};

interface DeleteAttachmentsByIdsOpts {
  ids: string[];
  deletedBy: string;
  deletedAt: string;
}

/** Soft-delete attachments by IDs. */
export const deleteAttachmentsByIds = async (
  ctx: AuthContext,
  { ids, deletedAt, deletedBy }: DeleteAttachmentsByIdsOpts,
) => {
  const { db, organizationId } = ctx.var;
  return db
    .update(attachmentsTable)
    .set({ deletedAt, deletedBy, updatedAt: deletedAt, updatedBy: deletedBy })
    .where(
      and(
        inArray(attachmentsTable.id, ids),
        eq(attachmentsTable.organizationId, organizationId),
        isNull(attachmentsTable.deletedAt),
      ),
    );
};

interface FindAttachmentByKeyOpts {
  key: string;
}

/** Find an attachment by any of its S3 keys (original, thumbnail, converted). Already tenant-scoped via RLS. */
export const findAttachmentByKey = async (ctx: DbContext, { key }: FindAttachmentByKeyOpts) => {
  const { db } = ctx.var;
  const [att] = await db
    .select()
    .from(attachmentsTable)
    .where(
      or(
        eq(attachmentsTable.originalKey, key),
        eq(attachmentsTable.thumbnailKey, key),
        eq(attachmentsTable.convertedKey, key),
      ),
    )
    .limit(1);
  return att;
};

interface FindAttachmentKeysByGroupIdOpts {
  groupId: string;
}

/** Find attachment IDs and S3 keys by group ID (e.g. to check which attachments belong to an entity). */
export const findAttachmentKeysByGroupId = async (ctx: DbContext, { groupId }: FindAttachmentKeysByGroupIdOpts) => {
  const { db } = ctx.var;
  return db
    .select({
      id: attachmentsTable.id,
      convertedKey: attachmentsTable.convertedKey,
      originalKey: attachmentsTable.originalKey,
    })
    .from(attachmentsTable)
    .where(eq(attachmentsTable.groupId, groupId));
};

interface FindAttachmentViewCountOpts {
  entityId: string;
}

/** Get an attachment's view count from product counters. */
export const findAttachmentViewCount = async (ctx: DbContext, { entityId }: FindAttachmentViewCountOpts) => {
  const { db } = ctx.var;
  const [counters] = await db
    .select({ viewCount: productCountersTable.viewCount })
    .from(productCountersTable)
    .where(eq(productCountersTable.entityId, entityId))
    .limit(1);
  return counters?.viewCount ?? 0;
};
