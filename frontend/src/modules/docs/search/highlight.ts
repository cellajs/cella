const escapeRegExp = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Wrap every occurrence of the given terms in `<mark>` tags (case-insensitive).
 * The row renderer parses these tags back into styled spans — no HTML injection.
 */
export function markMatches(text: string, terms: string[]): string {
  const cleaned = terms.filter(Boolean).map(escapeRegExp);
  if (!cleaned.length) return text;
  return text.replace(new RegExp(`(${cleaned.join('|')})`, 'gi'), '<mark>$1</mark>');
}
