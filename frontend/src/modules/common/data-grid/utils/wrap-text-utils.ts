import type { CalculatedColumn, Column, Maybe } from '../types';

/** Default line height in pixels for wrap-text row height calculation */
const wrapTextLineHeight = 20;

/** Default vertical padding per cell in pixels */
const wrapTextPadding = 12;

/** Default max lines when wrapText is `true` (unlimited) */
const defaultMaxLines = 10;

/** Quantize wrapped-row heights to improve grid-track compression and bound scroll jitter. */
const heightTiers = [1, 2, 3, 4] as const;

/** Resolve a wrapText value to a concrete max-lines number (0 = no wrapping). */
export function resolveWrapTextLines(wrapText: Maybe<number | boolean>): number {
  if (wrapText === true) return defaultMaxLines;
  if (typeof wrapText === 'number' && wrapText >= 1) return Math.max(1, Math.floor(wrapText));
  return 0;
}

/**
 * Estimate content lines from explicit `\n` breaks (min 1). The "B" of the A+B
 * hybrid: a lightweight heuristic to size rows needing fewer lines than the cap.
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
 * Snap a line count to the nearest height tier.
 * Returns the smallest tier that is ≥ the given line count.
 */
function snapToTier(lines: number): number {
  for (const tier of heightTiers) {
    if (lines <= tier) return tier;
  }
  return heightTiers[heightTiers.length - 1];
}

/**
 * Convert a tier (line count) to a pixel height.
 */
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

  // Snap to discrete tier for predictable grid track sizing
  const tier = snapToTier(maxLines);
  return tierToHeight(tier, baseHeight, lineHeight, padding);
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
