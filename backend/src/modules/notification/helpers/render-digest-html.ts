import { escapeString } from '../../../../emails/renderer/escape-string';

// Bodies are stored as HTML, so they are reduced to plain text before being placed in an email:
// the digest renders many excerpts side by side and arbitrary markup would fight the template's
// styling. Escaping is delegated to the email renderer's own `escapeString`.
const TAG = /<[^>]*>/g;
const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** Strip markup, decode the entities a stored body carries, and collapse whitespace. */
function htmlToPlainText(html: string): string {
  return html
    .replace(TAG, ' ')
    .replace(/&[a-z#0-9]+;/gi, (entity) => NAMED_ENTITIES[entity.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plain text, truncated on a word boundary, escaped for interpolation into an email body. */
export function htmlToExcerpt(html: string, maxLength: number): string {
  const text = htmlToPlainText(html);
  if (text.length <= maxLength) return escapeString(text);

  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${escapeString(cut.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : maxLength))}…`;
}

export { escapeString };
