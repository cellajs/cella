import type { AuthContext } from '#/core/context';
import type { NotificationSubjectRow } from '#/lib/module';
import type { MutationPayload } from '#/lib/mutation-bus';
import { log } from '#/utils/logger';
import { extractMentionIds } from '../helpers/extract-mentions';
import { readableAccess } from '../helpers/readable-access';
import { type NotificationSource, writeSubjectMentions } from '../notification-sources';

/**
 * Re-derives `mentions` from the stored body, inside the writing transaction, for the writes the
 * source's `deriveFrom` counts (registered per mentionable source by notification-sources.ts).
 *
 * Deriving client-side and storing whatever the client sends would let a hand-crafted request
 * notify anyone, including users with no access to the row. Deriving server-side and filtering by
 * read permission makes the column trustworthy, which is what the fan-out relies on.
 */
export async function deriveMentions(
  ctx: AuthContext,
  payload: MutationPayload,
  source: NotificationSource,
): Promise<void> {
  if (!derivesFrom(source.deriveFrom, payload)) return;

  const rows = (payload.after ?? []) as unknown as NotificationSubjectRow[];

  for (const [index, row] of rows.entries()) {
    // `before`/`after` are index-aligned; an edit that left the body alone changes no mentions.
    const before = payload.before?.[index];
    if (before && before.description === row.description) continue;

    const mentioned = extractMentionIds(row.description);
    // A mention must never leak a row's existence to someone who may not read it.
    const readable = await readableAccess(source.entityType, row, mentioned);
    const allowed = mentioned.filter((userId) => readable.has(userId));

    // Only write when the derived set actually differs, so an unrelated edit is a no-op.
    if (sameSet(allowed, row.mentions ?? [])) continue;

    const written = await writeSubjectMentions(source, ctx.var.db, row.id, allowed);
    if (!written) {
      log.error('Mentionable notification source cannot write mentions; derivation skipped', {
        entityType: source.entityType,
      });
      return;
    }

    if (allowed.length !== mentioned.length) {
      log.debug('Dropped mentions the user cannot read', {
        entityType: source.entityType,
        subjectId: row.id,
        dropped: mentioned.length - allowed.length,
      });
    }
  }
}

function derivesFrom(mode: NotificationSource['deriveFrom'], payload: MutationPayload): boolean {
  if (mode === 'both') return true;
  return payload.serverOrigin ? mode === 'materialized' : mode === 'client';
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((value) => set.has(value));
}
