import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { defaultPreferences } from '#/modules/notification/notification-db';
import { findPreferences, updatePreferences } from '#/modules/notification/notification-queries';
import type { preferencesSchema, updatePreferencesBodySchema } from '#/modules/notification/notification-schema';

type Preferences = z.infer<typeof preferencesSchema>;
type PreferencesUpdate = z.infer<typeof updatePreferencesBodySchema>;

function toResponse(row: Preferences): Preferences {
  return { mentionEmail: row.mentionEmail, commentEmail: row.commentEmail, digest: row.digest };
}

/** The caller's email and digest preferences; the defaults for a user who never saved any. */
export async function getPreferencesOp(ctx: UserContext): Promise<Preferences> {
  return toResponse((await findPreferences(ctx, { userId: ctx.var.user.id })) ?? defaultPreferences);
}

/** Partial update: only the keys in the body are written, so a tab that predates a preference cannot reset it. */
export async function updatePreferencesOp(ctx: UserContext, input: PreferencesUpdate): Promise<Preferences> {
  return toResponse(await updatePreferences(ctx, { userId: ctx.var.user.id, values: input }));
}
