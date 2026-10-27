import type { DbContext } from '#/core/context';
import { type DigestSection, describeDigestRow } from '#/modules/notification/helpers/render-digest-html';
import { findChannelNames, findUndigestedNotifications, getUserAccess } from '#/modules/notification/notification-queries';
import { findContextNames } from '#/modules/notification/notification-sources';
import { findReadableSubjectIds } from '#/modules/notification/operations/readable-subjects';

/** Rows quoted per channel before the section collapses into "and N more". */
const rowsPerChannel = 5;

/** Rows read per digest, oldest activity first; the overflow counts cover these, and rows past them are left out. */
const maxRows = 500;

interface DigestContent {
  notificationIds: string[];
  sections: DigestSection[];
}

/**
 * Assemble one user's digest for the window `[since, now)`, with lines in the recipient's
 * language. The runner bounds `since` (run-digest.ts).
 *
 * Rows already emailed instantly are excluded, so a mention or comment never arrives twice. So are rows of
 * an organization the user left and rows whose subject the user may no longer read: the digest
 * names only what the recipient can open.
 */
export async function buildDigestForUser(ctx: DbContext, userId: string, since: Date, lng: string): Promise<DigestContent> {
  const empty: DigestContent = { notificationIds: [], sections: [] };
  const undigested = await findUndigestedNotifications(ctx, { userId, since: since.toISOString(), limit: maxRows });
  const access = undigested.length ? (await getUserAccess(ctx, { userIds: [userId] })).get(userId) : undefined;
  if (!access) return empty;

  const readable = await findReadableSubjectIds(access, undigested);
  const rows = undigested.filter((row) => readable.has(row.subjectId));
  if (rows.length === 0) return empty;

  const contextNames = await findContextNames(rows.map((row) => ({ ...row, id: row.contextId })));
  const channelNames = await findChannelNames(ctx, { channelIds: rows.map((row) => row.channelId) });

  const sections: DigestSection[] = [];
  for (const [channelId, channelRows] of Map.groupBy(rows, (row) => row.channelId)) {
    const visible = channelRows.slice(0, rowsPerChannel);
    sections.push({
      channelId,
      channelName: channelNames.get(channelId) ?? '',
      lines: visible.map((row) => describeDigestRow(row.type, contextNames.get(row.contextId ?? '') ?? '', lng)),
      overflow: Math.max(0, channelRows.length - visible.length),
    });
  }

  return { notificationIds: rows.map((row) => row.id), sections };
}
