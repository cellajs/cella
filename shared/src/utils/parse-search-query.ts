import { containsWord, foldText, type MatchMode, matchesTerms } from './text-match';

/** A word or quoted phrase of a search, as typed without its quotes; a leading '-' excludes it. */
export type SearchPart = { text: string; exclude: boolean };

// '-' excludes only at the start of a part, so 'front-end' stays one word; a quote still being typed runs to the end
const partPattern = /(-?)(?:"([^"]*)"?|(\S+))/g;

/** The words and quoted phrases of a query without its '=' marker. A lone '-' is an exclusion still being typed. */
export const parseSearchParts = (query: string): SearchPart[] => {
  const parts: SearchPart[] = [];
  for (const [, minus, phrase, word] of query.matchAll(partPattern)) {
    const text = (phrase ?? word ?? '').trim().replace(/\s+/g, ' ');
    if (text && text !== '-') parts.push({ text, exclude: !!minus });
  }
  return parts;
};

/** Writes parts back as a query, quoting a phrase. */
export const formatSearchParts = (parts: SearchPart[]) =>
  parts.map(({ text, exclude }) => `${exclude ? '-' : ''}${/\s/.test(text) ? `"${text}"` : text}`).join(' ');

/**
 * Parse a search query. A leading '=' switches the search from filtering to highlighting, for a view that can keep
 * every item and tint the matches; a list that only filters ignores it. A '-' word or phrase leaves items out in either
 * mode. `terms` are the folded words and phrases to match, `excludeTerms` the excluded ones, and `highlight` is only
 * true when a term follows the marker. The one grammar of every search, so a list filtered in the browser, the
 * database filter (`searchFilter` in the backend) and the highlight painted over a result agree.
 */
export const parseSearchQuery = (q: string | null | undefined) => {
  const trimmed = q?.trim() ?? '';
  const marked = trimmed.startsWith('=');
  const effectiveQ = (marked ? trimmed.slice(1) : trimmed).trim();
  const parts = parseSearchParts(effectiveQ);
  const terms = parts.filter((part) => !part.exclude).map((part) => foldText(part.text));
  const excludeTerms = parts.filter((part) => part.exclude).map((part) => foldText(part.text));
  return { highlight: marked && terms.length > 0, effectiveQ, parts, terms, excludeTerms };
};

/**
 * Whether an item's folded fields match a parsed query: its terms (every one, or one in `any` mode) and none of its
 * '-' terms as a whole word. The browser side of `searchFilter` in the backend. A query without terms matches.
 */
export const matchesSearch = (
  foldedFields: string[],
  { terms, excludeTerms }: Pick<ReturnType<typeof parseSearchQuery>, 'terms' | 'excludeTerms'>,
  mode: MatchMode = 'all',
): boolean => {
  if (excludeTerms.some((term) => foldedFields.some((field) => containsWord(field, term)))) return false;
  return !terms.length || matchesTerms(foldedFields, terms, mode);
};
