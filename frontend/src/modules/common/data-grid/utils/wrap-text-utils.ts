import type { CalculatedColumn, Column, Maybe } from '../types';

/** Default line height in pixels for wrap-text row height calculation */
const wrapTextLineHeight = 20;

/** Default vertical padding per cell in pixels */
const wrapTextPadding = 12;

/** Default max lines when wrapText is `true` (unlimited) */
const defaultMaxLines = 10;

/**
 * Resolve a wrapText value to a concrete max-lines number.
 * - `undefined` / `null` / `false` → 0 (no wrapping)
 * - `true` → defaultMaxLines
 * - `number` → that number (clamped ≥ 1)
 */
export function resolveWrapTextLines(wrapText: Maybe<number | boolean>): number {
  if (wrapText === true) return defaultMaxLines;
  if (typeof wrapText === 'number' && wrapText >= 1) return Math.max(1, Math.floor(wrapText));
  return 0;
}

/**
 * Estimate the number of content lines for a text value based on explicit
 * line breaks (`\n`). Returns at least 1.
 *
 * This is the "B" part of the A+B hybrid: a lightweight data-aware heuristic
 * that counts explicit newlines to size rows that need fewer lines than the cap.
 */
function estimateTextLines(value: unknown): number {
  if (value == null) return 1;
  const str = String(value);
  if (str.length === 0) return 1;
  // Count explicit newlines
  let count = 1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\n') count++;
  }
  return count;
}

/**
 * Compute the effective row height for a row, taking wrapText columns into account.
 *
 * For each column with `wrapText`, estimates content lines from `row[column.key]`,
 * clamps to the column's max lines, and returns:
 *   `max(baseHeight, maxNeededLines * lineHeight + padding)`
 *
 * @param baseHeight - The base row height (number)
 * @param columns - All calculated columns
 * @param row - The row data object
 * @param lineHeight - Pixel height per line (default: wrapTextLineHeight)
 * @param padding - Vertical cell padding in pixels (default: wrapTextPadding)
 */
export function computeWrapTextRowHeight<R>(
  baseHeight: number,
  columns: readonly CalculatedColumn<R, unknown>[],
  row: R,
  lineHeight = wrapTextLineHeight,
  padding = wrapTextPadding,
): number {
  let maxLines = 0;

  for (const column of columns) {
    const cap = resolveWrapTextLines(column.wrapText);
    if (cap === 0) continue;

    // Use custom estimator if provided, otherwise fall back to newline counting
    const estimated = column.estimateLines
      ? column.estimateLines(row)
      : estimateTextLines((row as Record<string, unknown>)[column.key]);
    const clamped = Math.min(estimated, cap);

    if (clamped > maxLines) maxLines = clamped;
  }

  if (maxLines <= 1) return baseHeight;
  return Math.max(baseHeight, maxLines * lineHeight + padding);
}

/**
 * Check if any column in the list has wrapText enabled.
 */
export function hasWrapTextColumns<R, SR>(columns: readonly Column<R, SR>[]): boolean {
  return columns.some((col) => {
    const lines = resolveWrapTextLines(col.wrapText);
    return lines > 0;
  });
}
