/** `[start, end)` in the original string's code units. */
export type MatchRange = [start: number, end: number];

const combiningMarks = /[\u0300-\u036f]/g;

/**
 * Lowercase with accents removed: "Renée" folds to "renee". Idempotent. Mirrors the SQL `fold_search` function, so a
 * term folded here matches a column folded there: a list filter, a database search and the highlight painted over a
 * result never disagree about what matched.
 */
export const foldText = (text: string): string => text.toLowerCase().normalize('NFD').replace(combiningMarks, '');

/** The folded terms of a query, the words between its spaces and commas. */
export const parseTerms = (query: string | null | undefined): string[] =>
  foldText(query ?? '')
    .split(/[\s,]+/)
    .filter(Boolean);

/**
 * Whether the folded fields contain every term. The caller passes fields through `foldText`, so a list folds each row once
 * and not per keystroke. An empty query matches nothing: showing everything is the caller's decision.
 */
export const matchesTerms = (foldedFields: string[], terms: string[]): boolean =>
  terms.length > 0 && terms.every((term) => foldedFields.some((field) => field.includes(term)));

/**
 * Folds one code point at a time so each folded code unit knows the original offset it came from.
 * A dropped combining mark adds nothing; an expansion ("İ" folds to two units) repeats its offset.
 */
const foldWithOffsets = (text: string): { folded: string; offsets: number[] } => {
  let folded = '';
  const offsets: number[] = [];
  let index = 0;
  for (const char of text) {
    const piece = foldText(char);
    for (let i = 0; i < piece.length; i++) offsets.push(index);
    folded += piece;
    index += char.length;
  }
  offsets.push(text.length);
  return { folded, offsets };
};

/** Every occurrence of every term in `text`, as merged ranges in reading order. */
export const findMatchRanges = (text: string, terms: string[]): MatchRange[] => {
  if (!text || !terms.length) return [];
  const { folded, offsets } = foldWithOffsets(text);

  const found: MatchRange[] = [];
  for (const term of terms) {
    if (!term) continue;
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + 1)) {
      const start = offsets[at];
      const end = offsets[at + term.length];
      if (start !== undefined && end !== undefined) found.push([start, end]);
    }
  }
  found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: MatchRange[] = [];
  for (const range of found) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
};

/**
 * A window of about `length` characters around the first match, with an ellipsis on each cut side.
 * Text without a match is cut at the start.
 */
export const trimAroundMatch = (text: string, terms: string[], length = 120): string => {
  if (text.length <= length) return text;

  const first = findMatchRanges(text, terms)[0];
  if (!first) return `${text.slice(0, length)}…`;

  const start = Math.max(0, Math.min(first[0] - Math.floor(length / 3), text.length - length));
  const end = Math.min(text.length, start + length);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
};
