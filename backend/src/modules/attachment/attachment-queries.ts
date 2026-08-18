import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AuthContext, DbContext } from '#/core/context';
import { attachmentsTable } from '#/modules/attachment/attachment-db';

interface FindAttachmentsByStxMutationIdOpts {
  mutationId: string;
}

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

interface FindAttachmentsByIdsOpts {
  ids: string[];
}

/** Tenant-scoped via RLS from `tenantRead`: unknown, deleted and cross-tenant ids are absent. */
export const findAttachmentsByIds = async (ctx: DbContext, { ids }: FindAttachmentsByIdsOpts) => {
  const { db } = ctx.var;
  return db
    .select()
    .from(attachmentsTable)
    .where(and(inArray(attachmentsTable.id, ids), isNull(attachmentsTable.deletedAt)));
};
