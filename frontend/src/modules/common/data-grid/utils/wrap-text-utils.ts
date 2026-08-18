import type { CalculatedColumn, Column, Maybe } from '../types';

/** Default line height in pixels for wrap-text row height calculation */
const wrapTextLineHeight = 20;

/** Default vertical padding per cell in pixels */
const wrapTextPadding = 12;

/** Approximate average glyph advance (px) for the grid body font at text-sm. */
const avgCharWidth = 7;

/** Horizontal inset (px) subtracted from a column's rendered width before wrapping. */
const wrapTextHorizontalPadding = 8;

const defaultMaxLines = 10;

/** Quantize wrapped-row heights to improve grid-track compression and bound scroll jitter. */
const heightTiers = [1, 2, 3, 4] as const;

/** Resolve a wrapText value to a concrete max-lines number (0 = no wrapping). */
export function resolveWrapTextLines(wrapText: Maybe<number | boolean>): number {
  if (wrapText === true) return defaultMaxLines;
  if (typeof wrapText === 'number' && wrapText >= 1) return Math.max(1, Math.floor(wrapText));
  return 0;
}

/** Estimates wrapped lines from text length and rendered column width, so the budget follows resizing. */
export function estimateWrappedLines(
  textLength: number,
  width: number,
  charWidth = avgCharWidth,
  horizontalPadding = wrapTextHorizontalPadding,
): number {
  if (textLength <= 0) return 1;
  const usable = width - horizontalPadding;
  if (usable <= 0) return 1;
  const charsPerLine = Math.max(1, Math.floor(usable / charWidth));
  return Math.max(1, Math.ceil(textLength / charsPerLine));
}

/** Estimates content lines from explicit `\n` breaks, minimum 1. */
function estimateTextLines(value: unknown): number {
  if (value == null) return 1;
  const str = String(value);
  if (str.length === 0) return 1;
  let count = 1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\n') count++;
  }
  return count;
}

/** Smallest height tier that is at least the given line count. */
function snapToTier(lines: number): number {
  for (const tier of heightTiers) {
    if (lines <= tier) return tier;
  }
  return heightTiers[heightTiers.length - 1];
}

export function tierToHeight(
  tier: number,
  baseHeight: number,
  lineHeight = wrapTextLineHeight,
  padding = wrapTextPadding,
): number {
  if (tier <= 1) return baseHeight;
  return Math.max(baseHeight, tier * lineHeight + padding);
}

export function computeWrapTextRowHeight<R>(
  baseHeight: number,
  columns: readonly CalculatedColumn<R, unknown>[],
  row: R,
  getRenderedWidth: (column: CalculatedColumn<R, unknown>) => number,
  lineHeight = wrapTextLineHeight,
  padding = wrapTextPadding,
): number {
  let maxLines = 0;

  for (const column of columns) {
    const cap = resolveWrapTextLines(column.wrapText);
    if (cap === 0) continue;

    const estimated = column.estimateLines
      ? column.estimateLines(row, { width: getRenderedWidth(column) })
      : estimateTextLines((row as Record<string, unknown>)[column.key]);
    const clamped = Math.min(estimated, cap);

    if (clamped > maxLines) maxLines = clamped;
  }

  const tier = snapToTier(maxLines);
  return tierToHeight(tier, baseHeight, lineHeight, padding);
}

export function hasWrapTextColumns<R, SR>(columns: readonly Column<R, SR>[]): boolean {
  return columns.some((col) => {
    const lines = resolveWrapTextLines(col.wrapText);
    return lines > 0;
  });
}
