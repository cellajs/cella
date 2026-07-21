import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
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

/** Insert attachments and return the created rows. Silently skips duplicates (PK conflict). */
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

/** Update an attachment by ID and return the updated row. */
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

interface FindAttachmentByIdOpts {
  id: string;
}

/**
 * Find a live (non-deleted) attachment by its id. Tenant-scoped via RLS from
 * `tenantRead`; used by the presigned-url flow to resolve a caller-referenced
 * attachment before authorizing and signing one of its keys.
 */
export const findAttachmentById = async (ctx: DbContext, { id }: FindAttachmentByIdOpts) => {
  const { db } = ctx.var;
  const [att] = await db
    .select()
    .from(attachmentsTable)
    .where(and(eq(attachmentsTable.id, id), isNull(attachmentsTable.deletedAt)))
    .limit(1);
  return att;
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
    .where(eq(productCountersTable.productId, entityId))
    .limit(1);
  return counters?.viewCount ?? 0;
};
