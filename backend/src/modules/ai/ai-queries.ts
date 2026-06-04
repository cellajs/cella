import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { AuthContext, DbContext } from '#/core/context';
import { chatsTable, type InsertChatModel } from '#/db/schema/chats';
import { type InsertMessageModel, messagesTable } from '#/db/schema/messages';

export const insertChat = async (ctx: DbContext, values: InsertChatModel) => {
  const { db } = ctx.var;
  const [chat] = await db.insert(chatsTable).values(values).returning();
  return chat;
};

export const findChatsByUser = async (
  ctx: AuthContext,
  opts: {
    userId: string;
    archived: boolean;
    limit: number;
    offset: number;
    order: 'asc' | 'desc';
  },
) => {
  const { db, organizationId } = ctx.var;
  const orderFn = opts.order === 'desc' ? desc : asc;

  const filters = and(
    eq(chatsTable.organizationId, organizationId),
    eq(chatsTable.userId, opts.userId),
    opts.archived ? undefined : isNull(chatsTable.archivedAt),
  );

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(chatsTable)
      .where(filters)
      .orderBy(orderFn(chatsTable.createdAt))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ total: count() }).from(chatsTable).where(filters),
  ]);

  return { items, total };
};

export const findChatById = async (ctx: AuthContext, id: string) => {
  const { db, organizationId } = ctx.var;
  const [chat] = await db
    .select()
    .from(chatsTable)
    .where(and(eq(chatsTable.id, id), eq(chatsTable.organizationId, organizationId)))
    .limit(1);
  return chat;
};

export const updateChat = async (ctx: AuthContext, id: string, values: Partial<InsertChatModel>) => {
  const { db, organizationId } = ctx.var;
  const [updated] = await db
    .update(chatsTable)
    .set(values)
    .where(and(eq(chatsTable.id, id), eq(chatsTable.organizationId, organizationId)))
    .returning();
  return updated;
};

export const deleteChatsByIds = async (ctx: AuthContext, ids: string[]) => {
  const { db, organizationId } = ctx.var;
  return db
    .delete(chatsTable)
    .where(and(inArray(chatsTable.id, ids), eq(chatsTable.organizationId, organizationId)))
    .returning({ id: chatsTable.id });
};

export const insertMessage = async (ctx: DbContext, values: InsertMessageModel) => {
  const { db } = ctx.var;
  const [message] = await db.insert(messagesTable).values(values).returning();
  return message;
};

export const findMessagesByChat = async (
  ctx: AuthContext,
  opts: { chatId: string; limit: number; offset: number; order: 'asc' | 'desc' },
) => {
  const { db, organizationId } = ctx.var;
  const orderFn = opts.order === 'desc' ? desc : asc;

  const filters = and(eq(messagesTable.organizationId, organizationId), eq(messagesTable.chatId, opts.chatId));

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(messagesTable)
      .where(filters)
      .orderBy(orderFn(messagesTable.createdAt))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ total: count() }).from(messagesTable).where(filters),
  ]);

  return { items, total };
};
