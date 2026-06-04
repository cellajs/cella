import { foreignKey, index, jsonb, snakeCase, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenantSelectPolicy, writeThroughPolicies } from '#/db/rls-helpers';
import { chatsTable } from '#/db/schema/chats';
import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
import { productEntityColumns } from '#/db/utils/product-entity-columns';

/**
 * AI chat messages. Maps to TanStack AI's `UIMessage` type.
 * `role` follows the standard LLM convention: 'user' | 'assistant' | 'system' | 'tool'.
 * `parts` stores TanStack AI `MessagePart[]` (text, tool-call, tool-result, thinking) as jsonb.
 * `status` tracks streaming lifecycle: 'pending' | 'streaming' | 'complete' | 'error' | 'cancelled'.
 * @see https://github.com/TanStack/ai
 */
export const messagesTable = snakeCase.table(
  'messages',
  {
    ...productEntityColumns('message'),
    organizationId: uuid().notNull(),
    chatId: uuid()
      .notNull()
      .references(() => chatsTable.id, { onDelete: 'cascade' }),
    userId: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
    role: varchar({ length: maxLength.field }).notNull(),
    parts: jsonb().notNull().default([]),
    model: varchar({ length: maxLength.field }),
    status: varchar({ length: maxLength.field }).notNull().default('pending'),
    usage: jsonb(),
    error: text(),
  },
  (table) => [
    index('messages_organization_id_index').on(table.organizationId),
    index('messages_chat_id_index').on(table.chatId),
    index('messages_user_id_index').on(table.userId),
    index('messages_tenant_id_index').on(table.tenantId),
    index('messages_created_by_index').on(table.createdBy),
    index('messages_updated_by_index').on(table.updatedBy),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),
    tenantSelectPolicy('messages', table),
    ...writeThroughPolicies('messages'),
  ],
);

export type MessageModel = typeof messagesTable.$inferSelect;
export type InsertMessageModel = typeof messagesTable.$inferInsert;
