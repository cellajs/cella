import { foreignKey, index, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenantSelectPolicy, writeThroughPolicies } from '#/db/rls-helpers';
import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
import { contextRelationColumns } from '#/db/utils/context-relation-columns';
import { productEntityColumns } from '#/db/utils/product-entity-columns';

/**
 * AI chat sessions. Each chat belongs to one user within an organization.
 * Data model aligned with TanStack AI's `UIMessage` / `useChat` conventions.
 * @see https://github.com/TanStack/ai
 */
export const chatsTable = snakeCase.table(
  'chats',
  {
    ...productEntityColumns('chat'),
    ...contextRelationColumns('chat'),
    userId: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
    model: varchar({ length: maxLength.field }).notNull().default(''),
    archivedAt: timestamp('archived_at', { mode: 'string' }),
  },
  (table) => [
    index('chats_organization_id_index').on(table.organizationId),
    index('chats_user_id_index').on(table.userId),
    index('chats_tenant_id_index').on(table.tenantId),
    index('chats_created_by_index').on(table.createdBy),
    index('chats_updated_by_index').on(table.updatedBy),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),
    tenantSelectPolicy('chats', table),
    ...writeThroughPolicies('chats'),
  ],
);

export type ChatModel = typeof chatsTable.$inferSelect;
export type InsertChatModel = typeof chatsTable.$inferInsert;
