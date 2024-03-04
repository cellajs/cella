import { pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { organizationsTable } from "./organizations";

export const tokensTable = pgTable('tokens', {
    id: varchar('id').primaryKey(),
    type: varchar('type', {
        enum: ['EMAIL_VERIFICATION', 'PASSWORD_RESET', 'INVITATION'],
    }).notNull(),
    email: varchar('email'),
    userId: varchar('user_id').references(() => usersTable.id, { onDelete: 'cascade' }),
    organizationId: varchar('organization_id').references(() => organizationsTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});