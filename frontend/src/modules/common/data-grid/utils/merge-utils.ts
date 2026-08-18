import type { ActiveModes, CalculatedColumn, Column, ColumnMergeRule, GridMode } from '../types';

/** Mode precedence, lowest → highest: later modes win per overridden property. */
const modePrecedence: readonly GridMode[] = ['compact', 'mobile'];

/** Height in pixels contributed by one occupied top/bottom slot row inside a merged host cell. */
const slotRowHeight = 26;

interface ResolvedWidthOverrides {
  width?: number | string;
  minWidth?: number;
  maxWidth?: number;
}

/** Width, minWidth and maxWidth overrides from all active modes, resolved per property (mobile > compact). */
export function resolveModeOverrides<R, SR>(column: Column<R, SR>, activeModes: ActiveModes): ResolvedWidthOverrides {
  const resolved: ResolvedWidthOverrides = {};
  for (const mode of modePrecedence) {
    if (!activeModes[mode]) continue;
    const overrides = column.modes?.[mode];
    if (!overrides) continue;
    if (overrides.width != null) resolved.width = overrides.width;
    if (overrides.minWidth != null) resolved.minWidth = overrides.minWidth;
    if (overrides.maxWidth != null) resolved.maxWidth = overrides.maxWidth;
  }
  return resolved;
}

/** The `merge` of the highest-precedence active mode that defines one. */
export function resolveMergeRule<R, SR>(column: Column<R, SR>, activeModes: ActiveModes): ColumnMergeRule | undefined {
  for (let i = modePrecedence.length - 1; i >= 0; i--) {
    const mode = modePrecedence[i];
    if (!activeModes[mode]) continue;
    const merge = column.modes?.[mode]?.merge;
    if (merge != null) return merge;
  }
  return undefined;
}

const warnedMergeKeys = new Set<string>();

/** Warn once per invalid merge pair in development while falling back to normal visibility. */
export function warnInvalidMergeRule(columnKey: string, into: string): void {
  if (!import.meta.env.DEV) return;
  const pair = `${columnKey}→${into}`;
  if (warnedMergeKeys.has(pair)) return;
  warnedMergeKeys.add(pair);
  console.warn(
    `[DataGrid] merge rule on column "${columnKey}" is inactive: host column "${into}" is not a grid column at the current breakpoint/mode. Falling back to normal visibility.`,
  );
}

/** Extra row height for occupied top and bottom slot rows; left and right slots render inline and add none. */
export function computeMergedSlotExtraHeight<R, SR>(columns: readonly CalculatedColumn<R, SR>[]): number {
  let extra = 0;
  for (const column of columns) {
    const slots = column.mergedSlots;
    if (slots == null) continue;
    const height = (slots.top.length > 0 ? slotRowHeight : 0) + (slots.bottom.length > 0 ? slotRowHeight : 0);
    extra = Math.max(extra, height);
  }
  return extra;
}
