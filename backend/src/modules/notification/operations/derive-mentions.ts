import type { ActorContext } from '#/core/context';
import type { NotificationSubjectRow } from '#/lib/module';
import type { MutationPayload } from '#/lib/mutation-bus';
import { log } from '#/utils/logger';
import { extractMentionIds } from '../helpers/extract-mentions';
import { readableAccess } from '../helpers/readable-access';
import { type NotificationSource, writeSubjectMentions } from '../notification-sources';

/**
 * Re-derives `mentions` from the body, inside the writing transaction, for the writes the
 * source's `deriveFrom` counts (registered per mentionable source by notification-sources.ts).
 *
 * Deriving client-side and storing whatever the client sends would let a hand-crafted request
 * notify anyone, including users with no access to the row. Deriving server-side and filtering by
 * read permission makes the column trustworthy, which is what the fan-out relies on.
 *
 * Pre-write: the derived column per row about to be written, which the op writes in the edit's own
 * statement, so the edit stays one CDC activity.
 */
export async function prepareMentions(
  payload: MutationPayload,
  source: NotificationSource,
): Promise<({ mentions: string[] } | undefined)[]> {
  const changed = await changedMentionSets(payload, source);
  return (payload.after ?? []).map((_, index) => {
    const mentions = changed.get(index);
    return mentions && { mentions };
  });
}

/**
 * Post-write: persists the derived set for an op that did not prepare, and for a source that
 * stores mentions through its own `writeMentions`.
 */
export async function deriveMentions(
  ctx: ActorContext,
  payload: MutationPayload,
  source: NotificationSource,
): Promise<void> {
  const changed = await changedMentionSets(payload, source);
  for (const [index, mentions] of changed) {
    const row = payload.after?.[index] as unknown as NotificationSubjectRow;
    const written = await writeSubjectMentions(source, ctx.var.db, row.id, mentions);
    if (!written) {
      log.error('Mentionable notification source cannot write mentions; derivation skipped', {
        entityType: source.entityType,
      });
      return;
    }
  }
}

/** The readable mention set of each row whose set changes with this write, keyed by its index in `after`. */
async function changedMentionSets(payload: MutationPayload, source: NotificationSource) {
  const changed = new Map<number, string[]>();
  if (!derivesFrom(source.deriveFrom, payload)) return changed;

  const rows = (payload.after ?? []) as unknown as NotificationSubjectRow[];

  for (const [index, row] of rows.entries()) {
    // `before`/`after` are index-aligned; an edit that left the body alone changes no mentions.
    const before = payload.before?.[index];
    if (before && before.description === row.description) continue;

    const mentioned = extractMentionIds(row.description);
    // A mention must never leak a row's existence to someone who may not read it.
    const readable = await readableAccess(source.entityType, row, mentioned);
    const allowed = mentioned.filter((userId) => readable.has(userId));

    if (allowed.length !== mentioned.length) {
      log.debug('Dropped mentions the user cannot read', {
        entityType: source.entityType,
        subjectId: row.id,
        dropped: mentioned.length - allowed.length,
      });
    }

    // Only write when the derived set actually differs, so an unrelated edit is a no-op.
    if (!sameSet(allowed, row.mentions ?? [])) changed.set(index, allowed);
  }
  return changed;
}

function derivesFrom(mode: NotificationSource['deriveFrom'], payload: MutationPayload): boolean {
  if (mode === 'both') return true;
  return payload.materialized ? mode === 'materialized' : mode === 'client';
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((value) => set.has(value));
}
