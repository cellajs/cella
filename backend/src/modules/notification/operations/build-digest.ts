import type { DbContext } from '#/core/context';
import { type DigestSection, describeDigestRow } from '#/modules/notification/helpers/render-digest-html';
import {
  type FindUndigestedNotificationsOpts,
  findChannelNames,
  findUndigestedNotifications,
  getUserAccess,
} from '#/modules/notification/notification-queries';
import { findContextNames } from '#/modules/notification/notification-sources';
import { findReadableSubjectIds } from '#/modules/notification/operations/readable-subjects';

/** Rows quoted per channel before the section collapses into "and N more". */
const rowsPerChannel = 5;

/** Rows read per digest, oldest first; the overflow counts cover these, and rows past them are left out. */
const maxRows = 500;

type BuildDigestOpts = Omit<FindUndigestedNotificationsOpts, 'limit'> & {
  /** Recipient language of the lines. */
  lng: string;
};

/**
 * Assemble one user's digest sections for the window `[since, before)`; none when nothing in it is left to name.
 *
 * Rows already emailed instantly are excluded, so a mention or comment never arrives twice. So are rows of
 * an organization the user left and rows whose subject the user may no longer read: the digest
 * names only what the recipient can open.
 */
export async function buildDigestForUser(ctx: DbContext, { userId, since, before, lng }: BuildDigestOpts): Promise<DigestSection[]> {
  const undigested = await findUndigestedNotifications(ctx, { userId, since, before, limit: maxRows });
  const access = undigested.length ? (await getUserAccess(ctx, { userIds: [userId] })).get(userId) : undefined;
  if (!access) return [];

  const readable = await findReadableSubjectIds(access, undigested);
  const rows = undigested.filter((row) => readable.has(row.subjectId));
  if (rows.length === 0) return [];

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

  return sections;
}
