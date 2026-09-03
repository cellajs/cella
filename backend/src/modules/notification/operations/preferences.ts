import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import type { NotificationPreferencesModel } from '../notification-db';
import { findOrCreatePreferences, updatePreferences } from '../notification-queries';
import type { preferencesSchema, updatePreferencesBodySchema } from '../notification-schema';
import { emailPreferenceKey, emailPreferenceRecord } from '../notification-types';

type Preferences = z.infer<typeof preferencesSchema>;
type PreferencesUpdate = z.infer<typeof updatePreferencesBodySchema>;

const toResponse = (row: NotificationPreferencesModel): Preferences => ({
  ...emailPreferenceRecord((type) => row[emailPreferenceKey(type)]),
  digest: row.digest,
});

export async function getPreferencesOp(ctx: AuthContext): Promise<Preferences> {
  return toResponse(await findOrCreatePreferences(ctx, ctx.var.user.id));
}

/**
 * Partial update: only the keys present in the body are written.
 *
 * Legacy replaced the whole settings object, so a stale client silently reverted every preference
 * it did not know about. Merging per key means adding a category later cannot be clobbered by an
 * older tab.
 */
export async function updatePreferencesOp(ctx: AuthContext, input: PreferencesUpdate): Promise<Preferences> {
  const userId = ctx.var.user.id;
  await findOrCreatePreferences(ctx, userId);
  return toResponse(await updatePreferences(ctx, userId, input));
}
