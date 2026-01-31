# Data Grid Improvements Plan

This document outlines the implementation plan to enhance the embedded data-grid component for Cella's requirements. Features are ordered by complexity and impact on other requirements.

## Current State Summary

| Feature | Status | Notes |
|---------|--------|-------|
| Row selection (none/single/multi) | ✅ Complete | `selectionMode` prop exists |
| Single cell selection | ✅ Complete | Via `selectedPosition` state |
| Multi-cell selection | ❌ Missing | No range selection |
| Single cell copy/paste | ✅ Complete | `useCopyPaste` hook |
| Multi-cell copy/paste | ❌ Missing | Depends on multi-cell selection |
| Mobile sub-row | ⚠️ Partial | Hooks exist, no integration |
| Skip keyboard navigation | ❌ Missing | No column-level property |
| Unidirectional virtualization | ✅ Complete | Already implemented |
| Mobile-friendly mode | ⚠️ Partial | Detection exists, no prop |
| Responsive column visibility | ⚠️ Partial | `useResponsiveColumns` hook exists, not integrated |

---

## Implementation Order

Starting with hardest/most impactful features that affect other requirements:

1. **Selection Mode Overhaul** (High effort, impacts #2)
2. **Multi-Cell Copy/Paste** (Medium effort, depends on #1)
3. **Mobile Sub-Row Rendering** (Medium effort, depends on #6)
4. **Read-Only Navigation Skip** (Low effort)
5. **Mobile-Friendly Mode** (Medium effort)
6. **Responsive Column Visibility** (Low effort)

---

## 1. Selection Mode Overhaul

### Goal
Consolidate all selection behavior into a unified `selectionMode` prop with clean naming.

### Current State
```typescript
// types.ts - current
export type SelectionMode = 'none' | 'single' | 'multi';
```
- Only controls row selection
- Cell selection always active via keyboard navigation
- No multi-cell range selection

### New API
```typescript
// types.ts - proposed
export type SelectionMode = 
  | 'none'        // No selection, no cell focus, keyboard nav disabled
  | 'cell'        // Single cell focus only (keyboard nav, no row selection)
  | 'cell-range'  // Multi-cell range selection (Shift+Click/Arrow)
  | 'row'         // Single row selection + cell focus
  | 'row-multi';  // Multiple row selection + cell focus (default)
```

### New Types Required
```typescript
// types.ts
export interface CellRange {
  start: Position;
  end: Position;
}

export interface CellRangeSelection {
  anchor: Position;      // Where selection started
  focus: Position;       // Current focus (can be before or after anchor)
}

export interface SelectedCellsChangeArgs<R, SR> {
  range: CellRange;
  cells: Array<{ row: R; column: CalculatedColumn<R, SR>; rowIdx: number; colIdx: number }>;
}
```

### Props Changes
```typescript
// data-grid.tsx - add new props
interface DataGridProps<R, SR, K> {
  // ... existing props
  
  /** Current cell range selection (controlled) */
  selectedCellRange?: Maybe<CellRange>;
  
  /** Callback when cell range selection changes */
  onSelectedCellRangeChange?: Maybe<(range: CellRange | null) => void>;
}
```

### Behavior Matrix

| Mode | Cell Focus | Cell Range | Row Selection | Keyboard Nav | Click Behavior |
|------|------------|------------|---------------|--------------|----------------|
| `none` | ❌ | ❌ | ❌ | ❌ | No effect |
| `cell` | ✅ | ❌ | ❌ | ✅ | Focus cell |
| `cell-range` | ✅ | ✅ | ❌ | ✅ | Focus cell, Shift extends |
| `row` | ✅ | ❌ | ✅ single | ✅ | Select row |
| `row-multi` | ✅ | ❌ | ✅ multi | ✅ | Select row, Shift extends |

### Implementation Steps

#### Step 1.1: Update Types
File: `frontend/src/modules/common/data-grid/types.ts`
- Rename `SelectionMode` values
- Add `CellRange`, `CellRangeSelection` interfaces
- Add `SelectedCellsChangeArgs` interface

#### Step 1.2: Add Cell Range State
File: `frontend/src/modules/common/data-grid/data-grid.tsx`
- Add `selectedCellRange` state
- Add `anchorCell` ref for range start tracking
- Modify `handleKeyDown` for Shift+Arrow range expansion
- Modify cell click handlers for Shift+Click range selection

#### Step 1.3: Create Range Selection Utilities
File: `frontend/src/modules/common/data-grid/utils/cell-range-utils.ts` (new)
```typescript
export function getCellsInRange<R, SR>(
  range: CellRange,
  rows: readonly R[],
  columns: readonly CalculatedColumn<R, SR>[]
): SelectedCell<R, SR>[];

export function normalizeCellRange(range: CellRange): CellRange;

export function isCellInRange(position: Position, range: CellRange): boolean;

export function expandRange(current: CellRange, direction: 'up' | 'down' | 'left' | 'right'): CellRange;
```

#### Step 1.4: Update Cell Component
File: `frontend/src/modules/common/data-grid/cell.tsx`
- Add `isInSelectedRange` prop
- Apply `rdg-cell-range-selected` class when in range
- Handle range boundary styling (top/right/bottom/left borders)

#### Step 1.5: Add Range Selection Styles
File: `frontend/src/modules/common/data-grid/style/data-grid.css`
```css
.rdg-cell-range-selected {
  background-color: var(--rdg-selection-color, rgba(0, 119, 255, 0.1));
}

.rdg-cell-range-selected.rdg-cell-range-top {
  border-top: 2px solid var(--rdg-selection-color, #0077ff);
}
/* ... similar for right, bottom, left */
```

#### Step 1.6: Disable Selection for 'none' Mode
- Skip all selection handlers when `selectionMode === 'none'`
- Set `tabIndex={-1}` on all cells
- Disable keyboard event handlers

### Files to Modify
| File | Changes |
|------|---------|
| `types.ts` | New types, rename SelectionMode values |
| `data-grid.tsx` | Range state, selection logic, new props |
| `cell.tsx` | Range selection styling |
| `style/data-grid.css` | Range selection CSS |
| `utils/cell-range-utils.ts` | New file with range utilities |
| `utils/selected-cell-utils.ts` | Update for new mode names |

---

## 2. Multi-Cell Copy/Paste

### Goal
Support copying and pasting multiple cells using Cmd+C/V, integrated with cell-range selection.

### Dependencies
- Requires #1 (Selection Mode Overhaul) for `selectedCellRange`

### Current State
- `useCopyPaste` hook handles single cell
- Uses `selectedPosition` only
- No TSV/CSV format support

### New API
```typescript
// hooks/use-copy-paste.ts
export interface CopyPasteOptions<R, SR> {
  selectedPosition: Position;
  selectedCellRange?: CellRange | null;  // NEW
  rows: readonly R[];
  columns: readonly CalculatedColumn<R, SR>[];
  
  // Single cell callbacks (existing)
  onCopy?: (args: CopyCallbackArgs<R, SR>) => boolean | void;
  onPaste?: (args: PasteCallbackArgs<R, SR>) => R | undefined;
  
  // Range callbacks (new)
  onCopyRange?: (args: CopyRangeArgs<R, SR>) => boolean | void;
  onPasteRange?: (args: PasteRangeArgs<R, SR>) => R[] | undefined;
  
  onRowChange?: (rowIdx: number, row: R) => void;
  onRowsChange?: (rows: R[], data: RowsChangeData<R, SR>) => void;  // NEW - batch update
}

export interface CopyRangeArgs<R, SR> {
  range: CellRange;
  cells: CellValue[][];
  rows: R[];
}

export interface PasteRangeArgs<R, SR> {
  startPosition: Position;
  values: string[][];
  affectedRows: R[];
}
```

### Implementation Steps

#### Step 2.1: Add TSV Utilities
File: `frontend/src/modules/common/data-grid/utils/clipboard-utils.ts` (new)
```typescript
export function serializeCellsToTSV<R>(
  range: CellRange,
  rows: readonly R[],
  columns: readonly CalculatedColumn<R, unknown>[]
): string;

export function parseTSVToCells(tsv: string): string[][];

export function serializeCellsToHTML<R>(
  range: CellRange,
  rows: readonly R[],
  columns: readonly CalculatedColumn<R, unknown>[]
): string;
```

#### Step 2.2: Extend useCopyPaste Hook
File: `frontend/src/modules/common/data-grid/hooks/use-copy-paste.ts`
- Accept `selectedCellRange` parameter
- Detect if range exists, use range copy logic
- Set both `text/plain` (TSV) and `text/html` (table) formats
- Parse incoming paste as TSV, apply to multiple cells

#### Step 2.3: Update DataGrid Integration
File: `frontend/src/modules/common/data-grid/data-grid.tsx`
- Pass `selectedCellRange` to `useCopyPaste`
- Add `onRowsChange` for batch updates after paste

### Copy Flow
1. User presses Cmd+C
2. Check if `selectedCellRange` exists
3. If yes: serialize range to TSV, call `onCopyRange`
4. If no: serialize single cell, call `onCopy`
5. Write to clipboard with `text/plain` and `text/html`

### Paste Flow
1. User presses Cmd+V
2. Read clipboard `text/plain`
3. Parse as TSV (split by `\n` and `\t`)
4. If multi-row/col: call `onPasteRange`, batch update
5. If single value: call `onPaste`, single update

### Files to Modify
| File | Changes |
|------|---------|
| `hooks/use-copy-paste.ts` | Range support, new callbacks |
| `utils/clipboard-utils.ts` | New file with TSV utilities |
| `data-grid.tsx` | Pass range, batch update support |

---

## 3. Mobile Sub-Row Rendering

### Goal
Allow columns marked as `mobileRole: 'sub'` to render as expandable sub-rows on mobile, without maintaining separate components.

### Dependencies
- Benefits from #6 (Responsive Column Visibility) for breakpoint detection

### New API

#### Column Configuration
```typescript
// types.ts - extend Column
interface Column<TRow, TSummaryRow> {
  // ... existing props
  
  /**
   * Mobile rendering behavior
   * - undefined: Normal column behavior
   * - 'sub': Hidden on mobile, rendered in parent's sub-row
   */
  mobileRole?: 'sub';
  
  /**
   * Custom label for sub-row display (defaults to column name)
   */
  mobileLabel?: string;
}
```

#### DataGrid Props
```typescript
// data-grid.tsx
interface DataGridProps<R, SR, K> {
  // ... existing props
  
  /**
   * Enable mobile sub-row rendering for columns with mobileRole: 'sub'
   * Can be boolean or breakpoint config for auto-detection
   * @default false
   */
  enableMobileSubRows?: boolean | { max: BreakpointKey };
  
  /**
   * Control which rows are expanded (controlled)
   */
  expandedRows?: ReadonlySet<K>;
  
  /**
   * Callback when row expansion changes
   */
  onExpandedRowsChange?: (expandedRows: Set<K>) => void;
}
```

### Implementation Steps

#### Step 3.1: Create MobileSubRow Component
File: `frontend/src/modules/common/data-grid/mobile-sub-row.tsx` (new)
```typescript
interface MobileSubRowProps<R, SR> {
  row: R;
  subColumns: CalculatedColumn<R, SR>[];
  isExpanded: boolean;
}

export function MobileSubRow<R, SR>({ row, subColumns, isExpanded }: MobileSubRowProps<R, SR>) {
  if (!isExpanded || subColumns.length === 0) return null;
  
  return (
    <div className="rdg-mobile-sub-row" role="row">
      {subColumns.map(col => (
        <div key={col.key} className="rdg-mobile-sub-item">
          <span className="rdg-mobile-sub-label">
            {col.mobileLabel ?? col.name}
          </span>
          <span className="rdg-mobile-sub-value">
            {col.renderCell?.({ column: col, row, rowIdx: -1, isCellEditable: false, tabIndex: -1, onRowChange: () => {} })}
          </span>
        </div>
      ))}
    </div>
  );
}
```

#### Step 3.2: Create Expand Toggle Component
File: `frontend/src/modules/common/data-grid/mobile-expand-toggle.tsx` (new)
```typescript
interface MobileExpandToggleProps {
  isExpanded: boolean;
  onToggle: () => void;
  hasSubColumns: boolean;
}

export function MobileExpandToggle({ isExpanded, onToggle, hasSubColumns }: MobileExpandToggleProps) {
  if (!hasSubColumns) return null;
  
  return (
    <button 
      className="rdg-mobile-expand-toggle"
      onClick={onToggle}
      aria-expanded={isExpanded}
    >
      <ChevronIcon direction={isExpanded ? 'down' : 'right'} />
    </button>
  );
}
```

#### Step 3.3: Modify Row Component
File: `frontend/src/modules/common/data-grid/row.tsx`
- Accept `isMobileMode`, `expandedRows`, `onToggleExpand`, `subColumns` props
- Render expand toggle in first cell when mobile
- Render `MobileSubRow` after main row when expanded

#### Step 3.4: Filter Columns in DataGrid
File: `frontend/src/modules/common/data-grid/data-grid.tsx`
- Detect mobile mode via `enableMobileSubRows` config
- Split columns into `visibleColumns` and `subColumns`
- Pass sub-columns to Row component
- Manage `expandedRows` state (internal or controlled)

#### Step 3.5: Add Sub-Row Styles
File: `frontend/src/modules/common/data-grid/style/data-grid.css`
```css
.rdg-mobile-sub-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--rdg-row-hover-background-color);
  border-bottom: 1px solid var(--rdg-border-color);
}

.rdg-mobile-sub-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.rdg-mobile-sub-label {
  font-weight: 500;
  color: var(--rdg-color);
  opacity: 0.7;
}

.rdg-mobile-expand-toggle {
  padding: 0.25rem;
  background: transparent;
  border: none;
  cursor: pointer;
}
```

### Files to Modify
| File | Changes |
|------|---------|
| `types.ts` | Add `mobileRole`, `mobileLabel` to Column |
| `data-grid.tsx` | Add props, column filtering, state management |
| `row.tsx` | Expand toggle, sub-row rendering |
| `mobile-sub-row.tsx` | New component |
| `mobile-expand-toggle.tsx` | New component |
| `style/data-grid.css` | Sub-row styles |

---

## 4. Read-Only Columns with Navigation Skip

### Goal
Add `focusable: false` to skip columns during keyboard navigation.

### New API
```typescript
// types.ts - extend Column
interface Column<TRow, TSummaryRow> {
  // ... existing props
  
  /**
   * Whether the column can receive keyboard focus.
   * When false, Tab and Arrow keys skip this column.
   * @default true
   */
  focusable?: boolean;
}
```

### Implementation Steps

#### Step 4.1: Add Type
File: `frontend/src/modules/common/data-grid/types.ts`
- Add `focusable?: boolean` to Column interface

#### Step 4.2: Apply Default in Calculated Columns
File: `frontend/src/modules/common/data-grid/hooks/use-calculated-columns.ts`
```typescript
const calculatedColumn: CalculatedColumn<R, SR> = {
  ...column,
  focusable: column.focusable ?? true,
  // ...
};
```

#### Step 4.3: Modify Navigation Logic
File: `frontend/src/modules/common/data-grid/utils/selected-cell-utils.ts`
```typescript
export function getNextSelectedCellPosition<R, SR>({
  columns,
  currentPosition,
  direction,
  ...
}: NavigationArgs<R, SR>): Position {
  let nextIdx = currentPosition.idx;
  const step = direction === 'right' || direction === 'down' ? 1 : -1;
  
  do {
    nextIdx += step;
  } while (
    nextIdx >= 0 && 
    nextIdx < columns.length && 
    columns[nextIdx].focusable === false
  );
  
  // Boundary check
  if (nextIdx < 0 || nextIdx >= columns.length) {
    return currentPosition;
  }
  
  return { 
    idx: nextIdx, 
    rowIdx: direction === 'up' || direction === 'down' 
      ? currentPosition.rowIdx + step 
      : currentPosition.rowIdx 
  };
}
```

#### Step 4.4: Update Cell tabIndex
File: `frontend/src/modules/common/data-grid/cell.tsx`
```typescript
// Set tabIndex to -1 for non-focusable columns
const tabIndex = column.focusable === false ? -1 : (isCellSelected ? 0 : -1);
```

### Files to Modify
| File | Changes |
|------|---------|
| `types.ts` | Add `focusable` property |
| `hooks/use-calculated-columns.ts` | Apply default |
| `utils/selected-cell-utils.ts` | Skip non-focusable |
| `cell.tsx` | Update tabIndex |

---

## 5. Mobile-Friendly Mode (Touch Mode)

### Goal
Add `touchMode` prop to disable hover/focus effects for cleaner touch experience.

### New API
```typescript
// data-grid.tsx
type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface DataGridProps<R, SR, K> {
  // ... existing props
  
  /**
   * Enable touch-friendly mode (disables hover/focus effects).
   * Can be boolean or breakpoint config for auto-detection.
   * @default false
   */
  touchMode?: boolean | { max: BreakpointKey } | { min: BreakpointKey };
}
```

### Implementation Steps

#### Step 5.1: Add Prop and Detection
File: `frontend/src/modules/common/data-grid/data-grid.tsx`
```typescript
const isTouchMode = useMemo(() => {
  if (typeof touchMode === 'boolean') return touchMode;
  if (!touchMode) return false;
  
  // Use breakpoint detection
  if ('max' in touchMode) {
    return currentBreakpoint <= breakpointOrder[touchMode.max];
  }
  if ('min' in touchMode) {
    return currentBreakpoint >= breakpointOrder[touchMode.min];
  }
  return false;
}, [touchMode, currentBreakpoint]);

// Apply data attribute
<div 
  className={rootClassname}
  data-touch-mode={isTouchMode || undefined}
>
```

#### Step 5.2: Add Touch Mode Styles
File: `frontend/src/modules/common/data-grid/style/data-grid.css`
```css
/* Disable hover effects in touch mode */
.rdg[data-touch-mode] .rdg-cell:hover {
  background-color: inherit;
}

.rdg[data-touch-mode] .rdg-row:hover {
  background-color: inherit;
}

/* Simplify focus indicators */
.rdg[data-touch-mode] .rdg-cell:focus {
  outline: none;
  box-shadow: none;
}

/* Simplified selection indicator */
.rdg[data-touch-mode] .rdg-row-selected {
  background-color: inherit;
  border-left: 3px solid var(--rdg-selection-color);
}

/* Larger touch targets */
.rdg[data-touch-mode] .rdg-cell {
  min-height: 48px;
}
```

### Files to Modify
| File | Changes |
|------|---------|
| `data-grid.tsx` | Add `touchMode` prop, detection logic |
| `style/data-grid.css` | Touch mode CSS rules |

---

## 6. Responsive Column Visibility

### Goal
Support `visible: { max: 'sm' }` format for breakpoint-based column visibility.

### New API
```typescript
// types.ts
type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

type ColumnVisibility = 
  | boolean 
  | { min: BreakpointKey }                        // Visible at min and above
  | { max: BreakpointKey }                        // Visible at max and below
  | { min: BreakpointKey; max: BreakpointKey };   // Visible in range

interface Column<TRow, TSummaryRow> {
  // ... existing props
  
  /**
   * Column visibility. Boolean or breakpoint-based.
   * @example visible: true
   * @example visible: { max: 'sm' }  // Mobile only
   * @example visible: { min: 'md' }  // Desktop only
   * @default true
   */
  visible?: ColumnVisibility;
}
```

### Implementation Steps

#### Step 6.1: Add Types
File: `frontend/src/modules/common/data-grid/types.ts`
```typescript
export type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export type ColumnVisibility = 
  | boolean 
  | { min: BreakpointKey }
  | { max: BreakpointKey }
  | { min: BreakpointKey; max: BreakpointKey };
```

#### Step 6.2: Add Breakpoint Utilities
File: `frontend/src/modules/common/data-grid/utils/breakpoint-utils.ts` (new)
```typescript
export const breakpointOrder: Record<BreakpointKey, number> = {
  'xs': 0, 'sm': 1, 'md': 2, 'lg': 3, 'xl': 4, '2xl': 5
};

export function isColumnVisible(
  visibility: ColumnVisibility | undefined,
  currentBreakpoint: BreakpointKey
): boolean {
  if (visibility === undefined || visibility === true) return true;
  if (visibility === false) return false;
  
  const current = breakpointOrder[currentBreakpoint];
  
  if ('min' in visibility && 'max' in visibility) {
    return current >= breakpointOrder[visibility.min] && 
           current <= breakpointOrder[visibility.max];
  }
  if ('min' in visibility) {
    return current >= breakpointOrder[visibility.min];
  }
  if ('max' in visibility) {
    return current <= breakpointOrder[visibility.max];
  }
  
  return true;
}
```

#### Step 6.3: Integrate in useCalculatedColumns
File: `frontend/src/modules/common/data-grid/hooks/use-calculated-columns.ts`
```typescript
import { useCurrentBreakpoint } from './use-current-breakpoint';
import { isColumnVisible } from '../utils/breakpoint-utils';

function useCalculatedColumns<R, SR>({ rawColumns, ... }) {
  const currentBreakpoint = useCurrentBreakpoint();
  
  const visibleRawColumns = useMemo(() => {
    return rawColumns.filter(col => 
      isColumnVisible(col.visible, currentBreakpoint)
    );
  }, [rawColumns, currentBreakpoint]);
  
  // Continue with existing calculation using visibleRawColumns...
}
```

#### Step 6.4: Add Current Breakpoint Hook
File: `frontend/src/modules/common/data-grid/hooks/use-current-breakpoint.ts` (new)
```typescript
import { useBreakpoints } from '~/hooks/use-breakpoints';
import type { BreakpointKey } from '../types';

export function useCurrentBreakpoint(): BreakpointKey {
  const is2xl = useBreakpoints('min', '2xl', false);
  const isXl = useBreakpoints('min', 'xl', false);
  const isLg = useBreakpoints('min', 'lg', false);
  const isMd = useBreakpoints('min', 'md', false);
  const isSm = useBreakpoints('min', 'sm', false);
  
  if (is2xl) return '2xl';
  if (isXl) return 'xl';
  if (isLg) return 'lg';
  if (isMd) return 'md';
  if (isSm) return 'sm';
  return 'xs';
}
```

### Files to Modify
| File | Changes |
|------|---------|
| `types.ts` | Add `BreakpointKey`, `ColumnVisibility` |
| `utils/breakpoint-utils.ts` | New file |
| `hooks/use-current-breakpoint.ts` | New file |
| `hooks/use-calculated-columns.ts` | Filter by visibility |
| `hooks/index.ts` | Export new hook |

---

## Summary

### New Files
| File | Purpose |
|------|---------|
| `utils/cell-range-utils.ts` | Range selection utilities |
| `utils/clipboard-utils.ts` | TSV serialization for copy/paste |
| `utils/breakpoint-utils.ts` | Breakpoint comparison utilities |
| `hooks/use-current-breakpoint.ts` | Current breakpoint detection |
| `mobile-sub-row.tsx` | Sub-row component for mobile |
| `mobile-expand-toggle.tsx` | Expand/collapse toggle |

### Modified Files
| File | Features Affected |
|------|-------------------|
| `types.ts` | #1, #3, #4, #6 |
| `data-grid.tsx` | #1, #2, #3, #5 |
| `cell.tsx` | #1, #4 |
| `row.tsx` | #3 |
| `hooks/use-copy-paste.ts` | #2 |
| `hooks/use-calculated-columns.ts` | #4, #6 |
| `utils/selected-cell-utils.ts` | #1, #4 |
| `style/data-grid.css` | #1, #3, #5 |

### Timeline Estimate
| Phase | Features | Effort |
|-------|----------|--------|
| Phase 1 | #6 (Visibility), #4 (Focusable) | 1-2 days |
| Phase 2 | #5 (Touch Mode), #1 (Selection) | 3-4 days |
| Phase 3 | #2 (Copy/Paste), #3 (Sub-Rows) | 2-3 days |

### Testing Checklist
- [ ] Unit tests for all new utilities
- [ ] Integration tests for selection modes
- [ ] Copy/paste tests with TSV format
- [ ] Mobile breakpoint tests
- [ ] Keyboard navigation with focusable=false
- [ ] Visual regression tests for styling
- [ ] Accessibility audit (ARIA, keyboard)
