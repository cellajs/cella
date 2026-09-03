import type { AuthContext } from '#/core/context';
import type { ModuleNotifications, NotificationSubjectRow } from '#/lib/module';
import type { MutationHandler, MutationPayload } from '#/lib/mutation-bus';
import { log } from '#/utils/logger';
import { extractMentionIds } from '../helpers/extract-mentions';
import { readableAccess } from '../helpers/readable-access';

/**
 * Mutation handler that re-derives `mentions` from the stored body, inside the writing
 * transaction, for one mentionable notification source (registered per source by
 * notification-sources.ts).
 *
 * Deriving client-side and storing whatever the client sends would let a hand-crafted request
 * notify anyone, including users with no access to the row. Deriving server-side and filtering by
 * read permission makes the column trustworthy, which is what the fan-out relies on.
 *
 * The source's `deriveFrom` picks the writes to read. By default Yjs materialization is skipped:
 * it re-writes a client-owned body without a user intent behind it, so a collaborative save
 * could resurrect a mention that was edited away. A source whose Yjs document is the body's
 * source of truth derives from the materialized body, or from both.
 */
export function deriveMentionsFor(entityType: string, source: ModuleNotifications): MutationHandler {
  return async (ctx: AuthContext, payload: MutationPayload): Promise<void> => {
    if (!derivesFrom(source.deriveFrom ?? 'client', payload)) return;
    if (!source.writeMentions) {
      log.error('Mentionable notification source lacks writeMentions; derivation skipped', { entityType });
      return;
    }

    const rows = (payload.after ?? []) as unknown as NotificationSubjectRow[];
    if (rows.length === 0) return;

    for (const row of rows) {
      const mentioned = extractMentionIds(row.description);
      // A mention must never leak a row's existence to someone who may not read it.
      const readable = await readableAccess(entityType, row, mentioned);
      const allowed = mentioned.filter((userId) => readable.has(userId));

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

function derivesFrom(mode: NonNullable<ModuleNotifications['deriveFrom']>, payload: MutationPayload): boolean {
  if (mode === 'both') return true;
  return payload.serverOrigin ? mode === 'materialized' : mode === 'client';
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((value) => set.has(value));
}
