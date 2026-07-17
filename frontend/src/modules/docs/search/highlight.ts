const escapeRegExp = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Wrap every occurrence of the given terms in `<mark>` tags (case-insensitive).
 * The row renderer parses these tags back into styled spans without HTML injection.
 */
export function markMatches(text: string, terms: string[]): string {
  const cleaned = terms.filter(Boolean).map(escapeRegExp);
  if (!cleaned.length) return text;
  return text.replace(new RegExp(`(${cleaned.join('|')})`, 'gi'), '<mark>$1</mark>');
}

/**
 * Shorten a paragraph to a window around the first term occurrence, so the
 * matched phrase is visible in the row even when it sits mid-paragraph.
 */
export function trimAroundMatch(text: string, terms: string[], length = 120): string {
  if (text.length <= length) return text;

  const lower = text.toLowerCase();
  let first = -1;
  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase());
    if (index !== -1 && (first === -1 || index < first)) first = index;
  }
  if (first === -1) return `${text.slice(0, length)}…`;

  const start = Math.max(0, Math.min(first - Math.floor(length / 3), text.length - length));
  const end = Math.min(text.length, start + length);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}
