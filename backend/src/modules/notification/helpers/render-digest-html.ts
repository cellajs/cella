import { escapeString } from '../../../../emails/renderer/escape-string';

// Bodies are stored as HTML, so they are reduced to plain text before being placed in an email:
// arbitrary markup would fight the template's styling. The text is escaped once, where it lands:
// Brevo escapes a param it fills, the renderer escapes JSX text.
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

/** Plain text, truncated on a word boundary. Not escaped: it goes out as a Brevo param, which Brevo escapes. */
export function htmlToExcerpt(html: string, maxLength: number): string {
  const text = htmlToPlainText(html);
  if (text.length <= maxLength) return text;

  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : maxLength)}…`;
}

export { escapeString };
