import type { ProductEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import type { ModuleNotifications, NotificationSubjectRow } from '#/lib/module';
import type { MutationHandler, MutationPayload } from '#/lib/mutation-bus';
import { checkAccessFanout } from '#/permissions';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { log } from '#/utils/logger';
import { accessForUserIds } from '../helpers/access-for-users';
import { extractMentionIds } from '../helpers/extract-mentions';

/**
 * Mutation handler that re-derives `mentions` from the stored body, inside the writing
 * transaction, for one mentionable notification source (registered per source by
 * notification-sources.ts).
 *
 * Deriving client-side and storing whatever the client sends would let a hand-crafted request
 * notify anyone, including users with no access to the row. Deriving server-side and filtering by
 * read permission makes the column trustworthy, which is what the fan-out relies on.
 *
 * Yjs materialisation re-writes rows without a user intent behind them; those are skipped so a
 * collaborative save cannot resurrect a mention that was edited away.
 */
export function deriveMentionsFor(entityType: string, source: ModuleNotifications): MutationHandler {
  return async (ctx: AuthContext, payload: MutationPayload): Promise<void> => {
    if (payload.serverOrigin) return;
    if (!source.writeMentions) {
      log.error('Mentionable notification source lacks writeMentions; derivation skipped', { entityType });
      return;
    }

    const rows = (payload.after ?? []) as unknown as NotificationSubjectRow[];
    if (rows.length === 0) return;

    for (const row of rows) {
      const mentioned = extractMentionIds(row.description);
      const allowed = mentioned.length ? await filterReadable(entityType, row, mentioned) : [];

      // Only write when the derived set actually differs, so an unrelated edit is a no-op.
      if (sameSet(allowed, row.mentions ?? [])) continue;

      await source.writeMentions(ctx.var.db, row.id, allowed);

      if (allowed.length !== mentioned.length) {
        log.debug('Dropped mentions the user cannot read', {
          entityType,
          subjectId: row.id,
          dropped: mentioned.length - allowed.length,
        });
      }
    }
  };
}

/** Drop mentioned users who may not read the row; a mention must never leak its existence. */
async function filterReadable(entityType: string, row: NotificationSubjectRow, userIds: string[]): Promise<string[]> {
  const accessByUser = await accessForUserIds(userIds);
  const subject = buildSubjectFromEntity(
    entityType as ProductEntityType,
    row as unknown as { id: string; createdBy?: string | null },
  );

  const accesses = userIds.map((userId) => accessByUser.get(userId)).filter((access) => access !== undefined);
  if (accesses.length !== userIds.length) return [];

  const decisions = checkAccessFanout(accesses, 'read', subject, { onInvalidMembership: 'deny' });
  return userIds.filter((_, index) => decisions[index]?.allowed);
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((value) => set.has(value));
}
