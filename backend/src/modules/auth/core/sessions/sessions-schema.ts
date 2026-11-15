import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { sessionsTable } from '#/modules/auth/core/sessions/sessions-db';

/** A session row as a response carries it, secret and revoker omitted: what a revoke returns, and what `/me` names of its own. */
export const sessionBaseSchema = createSelectSchema(sessionsTable).omit({ revokedBy: true });
