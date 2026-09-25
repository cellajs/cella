import { i18n } from '../../../../emails/i18n';
import { accessForUserIds } from '../helpers/access-for-users';
import { findChannelNames } from '../helpers/channel-names';
import { findReadableSubjectIds } from '../helpers/readable-subjects';
import { escapeString } from '../helpers/render-digest-html';
import { findSubjectNames } from '../helpers/subject-names';
import { findUndigestedNotifications } from '../notification-queries';

/** Rows quoted per channel before the section collapses into "and N more". */
const ROWS_PER_CHANNEL = 5;

/** Rows considered per digest; a larger backlog is summarised by the overflow counts. */
const MAX_ROWS = 500;

export interface DigestSection {
  channelId: string;
  channelName: string;
  lines: string[];
  overflow: number;
}

export interface DigestContent {
  notificationIds: string[];
  sections: DigestSection[];
}

/**
 * Assemble one user's digest for the window `[since, now)`, with lines in the recipient's
 * language. The runner bounds `since` (run-digest.ts).
 *
 * Rows already emailed instantly are excluded, so a mention never arrives twice. So are rows of
 * an organization the user left and rows whose subject the user may no longer read: the digest
 * names only what the recipient can open.
 */
export async function buildDigestForUser(userId: string, since: Date, lng: string): Promise<DigestContent> {
  const empty: DigestContent = { notificationIds: [], sections: [] };
  const undigested = await findUndigestedNotifications(userId, since.toISOString(), MAX_ROWS);
  const access = undigested.length ? (await accessForUserIds([userId])).get(userId) : undefined;
  if (!access) return empty;

  const readable = await findReadableSubjectIds(access, undigested);
  const rows = undigested.filter((row) => readable.has(row.subjectId));
  if (rows.length === 0) return empty;

  const contextNames = await findSubjectNames(rows.map((row) => ({ ...row, id: row.contextId })));
  const channelNames = await findChannelNames(rows.map((row) => row.channelId));

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

/**
 * One digest line as HTML, from `c:email.digest_line.<type>` (apps add theirs to `app.json`) with the
 * generic line as fallback. Kept short: the email links through and never reproduces the thread.
 * The title is interpolated escaped; any markup around it lives in the translation string.
 * @param type - Notification type, selecting the line's translation key.
 * @param contextTitle - Title of the item the notification is about; empty renders as `-`.
 * @param lng - Recipient language.
 * @returns The line, safe to place in the digest's HTML list.
 */
export function describeDigestRow(type: string, contextTitle: string, lng: string): string {
  return i18n.t([`c:email.digest_line.${type}`, 'c:email.digest_line.default'], { lng, title: contextTitle || '-' });
}

/** Digest sections as HTML with every user-derived fragment escaped: the digest mail's declared HTML param. */
export function renderSectionsHtml(sections: DigestSection[]): string {
  return sections
    .map((section) => {
      const items = section.lines.map((line) => `<li>${line}</li>`).join('');
      const more = section.overflow > 0 ? `<li>and ${section.overflow} more</li>` : '';
      return `<h3>${escapeString(section.channelName)}</h3><ul>${items}${more}</ul>`;
    })
    .join('');
}
