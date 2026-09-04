import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AuthContext, DbContext } from '#/core/context';
import { requestScopeWhere } from '#/db/utils/request-scope';
import { attachmentsTable } from '#/modules/attachment/attachment-db';

// Every read and write below carries the request's tenant + organization predicate, so the
// result is the same with RLS bypassed; the RLS transaction wrappers stay the backstop.

interface FindAttachmentsByStxMutationIdOpts {
  mutationId: string;
}

export const findAttachmentsByStxMutationId = async (
  ctx: AuthContext,
  { mutationId }: FindAttachmentsByStxMutationIdOpts,
) => {
  const { db } = ctx.var;
  return db
    .select()
    .from(attachmentsTable)
    .where(and(sql`${attachmentsTable.stx}->>'mutationId' = ${mutationId}`, requestScopeWhere(ctx, attachmentsTable)));
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
  const { db } = ctx.var;
  const [updated] = await db
    .update(attachmentsTable)
    .set(values)
    .where(and(eq(attachmentsTable.id, id), requestScopeWhere(ctx, attachmentsTable)))
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
  const { db } = ctx.var;
  return db
    .update(attachmentsTable)
    .set({ deletedAt, deletedBy, updatedAt: deletedAt, updatedBy: deletedBy })
    .where(
      and(
        inArray(attachmentsTable.id, ids),
        requestScopeWhere(ctx, attachmentsTable),
        isNull(attachmentsTable.deletedAt),
      ),
    );
};

interface FindAttachmentsByIdsOpts {
  ids: string[];
}

/** Unknown, deleted and out-of-scope ids are absent; the caller treats absence as rejection. */
export const findAttachmentsByIds = async (ctx: AuthContext, { ids }: FindAttachmentsByIdsOpts) => {
  const { db } = ctx.var;
  return db
    .select()
    .from(attachmentsTable)
    .where(
      and(
        inArray(attachmentsTable.id, ids),
        requestScopeWhere(ctx, attachmentsTable),
        isNull(attachmentsTable.deletedAt),
      ),
    );
};
