import { i18n } from '../../../../emails/i18n';
import { escapeString } from '../../../../emails/renderer/escape-string';

export interface DigestSection {
  channelId: string;
  channelName: string;
  lines: string[];
  overflow: number;
}

// Bodies are stored as HTML, so they are reduced to plain text before being placed in an email:
// arbitrary markup would fight the template's styling. The text is escaped once, where it lands:
// Brevo escapes a param it fills, the renderer escapes JSX text.
const TAG = /<[^>]*>/g;
const NAMED_ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** Strip markup, decode the entities a stored body carries, and collapse whitespace. */
function htmlToPlainText(html: string): string {
  return html
    .replace(TAG, ' ')
    .replace(/&[a-z#0-9]+;/gi, (entity) => NAMED_ENTITIES[entity.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plain text, truncated on a word boundary. Not escaped: it goes out as a Brevo param, which Brevo escapes. */
export function htmlToExcerpt(html: string, maxLength: number): string {
  const text = htmlToPlainText(html);
  if (text.length <= maxLength) return text;

  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : maxLength)}…`;
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

/**
 * Digest sections as HTML with every user-derived fragment escaped: the digest mail's declared HTML param.
 * @param sections - The sections `buildDigestForUser` assembled.
 * @param lng - Recipient language, for the line that counts the rows left out.
 * @returns The sections, safe to place in the digest mail.
 */
export function renderSectionsHtml(sections: DigestSection[], lng: string): string {
  return sections
    .map((section) => {
      const items = section.lines.map((line) => `<li>${line}</li>`).join('');
      const more = section.overflow > 0 ? `<li>${i18n.t('c:email.digest_overflow', { lng, count: section.overflow })}</li>` : '';
      return `<h3>${escapeString(section.channelName)}</h3><ul>${items}${more}</ul>`;
    })
    .join('');
}
