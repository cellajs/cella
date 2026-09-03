import { tenantReadById } from '#/db/tenant-context';
import { i18n } from '../../../../emails/i18n';
import { findChannelNames } from '../helpers/channel-names';
import { escapeString } from '../helpers/render-digest-html';
import { findUndigestedNotifications } from '../notification-queries';
import { getNotificationSource, loadSubjectNames } from '../notification-sources';

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
 * language.
 *
 * The window comes from the stored `lastDigestAt`, so a late or skipped run resumes exactly
 * where the previous one stopped; a fixed "now minus 24h" window would silently drop the gap.
 * Rows already emailed instantly are excluded, so a mention never arrives twice.
 */
export async function buildDigestForUser(userId: string, since: Date | null, lng: string): Promise<DigestContent> {
  const rows = await findUndigestedNotifications(userId, since?.toISOString() ?? null, MAX_ROWS);
  if (rows.length === 0) return { notificationIds: [], sections: [] };

  // Context titles live in tenant-scoped product tables, so they must be read under a tenant
  // transaction: on a bare connection the fail-closed RLS policy returns nothing and every line
  // renders blank. A user's notifications are almost always one tenant, so this is normally a
  // single round trip per source type.
  const contextIdsByTenantAndType = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.contextId) continue;
    const key = `${row.tenantId}:${row.entityType}`;
    const list = contextIdsByTenantAndType.get(key) ?? [];
    list.push(row.contextId);
    contextIdsByTenantAndType.set(key, list);
  }

  const contextNames = new Map<string, string>();
  for (const [key, contextIds] of contextIdsByTenantAndType) {
    const [tenantId, entityType] = key.split(':');
    const source = getNotificationSource(entityType);
    if (!source) continue;
    const names = await tenantReadById(tenantId, (tx) => loadSubjectNames(source, tx, [...new Set(contextIds)]));
    for (const [id, name] of names) contextNames.set(id, name);
  }

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
      lines: visible.map((row) => describeRow(row.type, contextNames.get(row.contextId ?? '') ?? '', lng)),
      overflow: Math.max(0, channelRows.length - visible.length),
    });
  }

  return { notificationIds: rows.map((row) => row.id), sections };
}

/**
 * One digest line, from `c:email.digest_line.<type>` (apps add theirs to `app.json`) with the
 * generic line as fallback. Kept short: the email links through and never reproduces the thread.
 */
function describeRow(type: string, contextTitle: string, lng: string): string {
  const title = `<strong>${escapeString(contextTitle || '-')}</strong>`;
  return i18n.t([`c:email.digest_line.${type}`, 'c:email.digest_line.default'], { lng, title });
}

/** Digest sections as sanitised HTML, because Brevo per-recipient params are strings only. */
export function renderSectionsHtml(sections: DigestSection[]): string {
  return sections
    .map((section) => {
      const items = section.lines.map((line) => `<li>${line}</li>`).join('');
      const more = section.overflow > 0 ? `<li>and ${section.overflow} more</li>` : '';
      return `<h3>${escapeString(section.channelName)}</h3><ul>${items}${more}</ul>`;
    })
    .join('');
}
