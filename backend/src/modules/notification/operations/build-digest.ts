import { baseDb } from '#/db/db';
import { type DigestSection, describeDigestRow } from '../helpers/render-digest-html';
import { findChannelNames, findUndigestedNotifications, getUserAccess } from '../notification-queries';
import { findSubjectNames } from '../notification-sources';
import { findReadableSubjectIds } from './readable-subjects';

/** Rows quoted per channel before the section collapses into "and N more". */
const ROWS_PER_CHANNEL = 5;

/** Rows considered per digest; a larger backlog is summarised by the overflow counts. */
const MAX_ROWS = 500;

/** Runs from the digest job, outside any request. */
const dbCtx = { var: { db: baseDb } };

export interface DigestContent {
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
export async function buildDigestForUser(userId: string, since: Date, lng: string): Promise<DigestContent> {
  const empty: DigestContent = { notificationIds: [], sections: [] };
  const undigested = await findUndigestedNotifications(dbCtx, { userId, since: since.toISOString(), limit: MAX_ROWS });
  const access = undigested.length ? (await getUserAccess(dbCtx, { userIds: [userId] })).get(userId) : undefined;
  if (!access) return empty;

  const readable = await findReadableSubjectIds(access, undigested);
  const rows = undigested.filter((row) => readable.has(row.subjectId));
  if (rows.length === 0) return empty;

  const contextNames = await findSubjectNames(rows.map((row) => ({ ...row, id: row.contextId })));
  const channelNames = await findChannelNames(dbCtx, { channelIds: rows.map((row) => row.channelId) });

  const byChannel = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byChannel.get(row.channelId) ?? [];
    list.push(row);
    byChannel.set(row.channelId, list);
  }

  const sections: DigestSection[] = [];
  for (const [channelId, channelRows] of byChannel) {
    const visible = channelRows.slice(0, ROWS_PER_CHANNEL);
    sections.push({
      channelId,
      channelName: channelNames.get(channelId) ?? '',
      lines: visible.map((row) => describeDigestRow(row.type, contextNames.get(row.contextId ?? '') ?? '', lng)),
      overflow: Math.max(0, channelRows.length - visible.length),
    });
  }

  return { notificationIds: rows.map((row) => row.id), sections };
}
