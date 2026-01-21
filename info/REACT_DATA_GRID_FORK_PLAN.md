# React Data Grid Fork Plan

This document outlines the plan to fork [Comcast/react-data-grid](https://github.com/Comcast/react-data-grid) and customize it for Cella's needs.

## Overview

**Goal**: Create a local fork of react-data-grid v7.0.0-beta.59 with the following customizations:
1. Configurable selection modes (cell, row, or none)
2. Unidirectional virtualization options (none, rows-only, columns-only, or both)
3. Enhanced copy/paste for single and multiple cells
4. Convert CSS to Tailwind with rem units instead of px
5. Mobile-responsive sub-row feature for compact display

---

## Phase 1: Setup & Integration

### 1.1 Clone and integrate the source
- [ ] Create `packages/data-grid/` directory in the monorepo
- [ ] Copy source from `src/` folder of react-data-grid (not the built output)
- [ ] Update `pnpm-workspace.yaml` to include the new package
- [ ] Create `packages/data-grid/package.json` with appropriate dependencies
- [ ] Set up TypeScript config (`tsconfig.json`) for the package
- [ ] Configure Vite/tsup build for the package

**Key source files to copy:**
```
src/
├── DataGrid.tsx           # Main component (~1370 lines)
├── TreeDataGrid.tsx       # Tree variant
├── Row.tsx                # Row component
├── Cell.tsx               # Cell component
├── HeaderRow.tsx          # Header row
├── SummaryRow.tsx         # Summary row
├── EditCell.tsx           # Edit cell
├── ScrollToCell.tsx       # Scroll helper
├── Columns.tsx            # SelectColumn etc.
├── types.ts               # TypeScript types
├── index.ts               # Exports
├── hooks/
│   ├── useCalculatedColumns.ts
│   ├── useColumnWidths.ts
│   ├── useGridDimensions.ts
│   ├── useViewportColumns.ts   # Column virtualization
│   ├── useViewportRows.ts      # Row virtualization
│   ├── useLatestFunc.ts
│   ├── useRowSelection.ts
│   └── index.ts
├── style/
│   ├── core.ts            # Main styles (uses ecij/css-in-js)
│   ├── cell.ts            # Cell styles
│   ├── row.ts             # Row styles
│   └── layers.css         # CSS layers
├── utils/
│   └── ...utility files
├── cellRenderers/
│   └── ...renderer files
└── editors/
    └── renderTextEditor.tsx
```

### 1.2 Update imports in Cella
- [ ] Update `frontend/src/modules/common/data-table/index.tsx` to import from local package
- [ ] Update all table components to use the new package
- [ ] Remove `react-data-grid` from frontend dependencies
- [ ] Add workspace dependency: `"@cella/data-grid": "workspace:*"`

---

## Phase 2: Selection Mode Configuration

### 2.1 Design decision
Add a new prop `selectionMode` with options:
```typescript
type SelectionMode = 'cell' | 'row' | 'none';

interface DataGridProps {
  selectionMode?: SelectionMode; // Default: 'cell' (current behavior)
}
```

### 2.2 Implementation tasks
- [ ] Add `selectionMode` prop to `DataGridProps` interface in `DataGrid.tsx`
- [ ] Modify `selectCell` function to respect selection mode
- [ ] Modify keyboard navigation to skip cell selection when mode is 'row'
- [ ] Modify `onCellClick` handling based on mode
- [ ] Update `selectedRows` logic to work with 'row' mode
- [ ] Disable all selection behavior when mode is 'none'
- [ ] Update focus management for each mode
- [ ] Add aria attributes appropriate for each mode

### 2.3 Files to modify
- `DataGrid.tsx`: Add prop, conditionally apply selection logic
- `Cell.tsx`: Conditionally apply cell selection styles
- `Row.tsx`: Handle row-level selection
- `style/cell.ts`: Selection-mode-aware styles
- `style/row.ts`: Row selection styles

---

## Phase 3: Unidirectional Virtualization

### 3.1 Design decision
Extend `enableVirtualization` to support granular control:
```typescript
type VirtualizationMode = 'none' | 'rows' | 'columns' | 'both';

interface DataGridProps {
  // Option A: Separate props
  enableRowVirtualization?: boolean;    // Default: true
  enableColumnVirtualization?: boolean; // Default: true
  
  // Option B: Combined prop (cleaner API)
  virtualization?: VirtualizationMode;  // Default: 'both'
}
```

**Recommendation**: Use Option A (separate props) for more flexibility.

### 3.2 Implementation tasks
- [ ] Add `enableRowVirtualization` and `enableColumnVirtualization` props
- [ ] Deprecate `enableVirtualization` (map to both booleans internally)
- [ ] Modify `useViewportRows.ts` to check `enableRowVirtualization`
- [ ] Modify `useCalculatedColumns.ts` to check `enableColumnVirtualization`
- [ ] Update row rendering in `getViewportRows()` function
- [ ] Update column rendering in viewport columns calculation
- [ ] Add tests for each virtualization combination

### 3.3 Files to modify
- `DataGrid.tsx`: Add new props, pass to hooks
- `hooks/useViewportRows.ts`: Conditional virtualization
- `hooks/useCalculatedColumns.ts`: Conditional column virtualization (lines 199-260)
- `hooks/useViewportColumns.ts`: Update based on column virtualization

### 3.4 Code changes

**In `useViewportRows.ts` (around line 104-116):**
```typescript
// Current:
if (enableVirtualization) {
  // calculate visible rows
}

// Changed:
if (enableRowVirtualization) {
  // calculate visible rows
}
```

**In `useCalculatedColumns.ts` (around line 199-210):**
```typescript
// Current:
if (!enableVirtualization) {
  return [0, columns.length - 1];
}

// Changed:
if (!enableColumnVirtualization) {
  return [0, columns.length - 1];
}
```

---

## Phase 4: Enhanced Copy/Paste

### 4.1 Current behavior analysis
The grid has `onCellCopy` and `onCellPaste` callbacks but only for single cells.

### 4.2 Design decision
Add multi-cell selection and clipboard support:
```typescript
interface DataGridProps {
  // New props
  enableMultiCellSelection?: boolean;
  enableRangeSelection?: boolean;
  selectedCellRange?: CellRange | null;
  onSelectedCellRangeChange?: (range: CellRange | null) => void;
  onRangeCopy?: (args: RangeCopyArgs) => void;
  onRangePaste?: (args: RangePasteArgs) => void;
}

interface CellRange {
  start: Position;
  end: Position;
}

interface RangeCopyArgs {
  range: CellRange;
  rows: R[];
  columns: CalculatedColumn[];
}

interface RangePasteArgs {
  startPosition: Position;
  data: string[][];
  rows: R[];
  columns: CalculatedColumn[];
}
```

### 4.3 Implementation tasks
- [ ] Add `CellRange` type and related interfaces
- [ ] Implement multi-cell selection state
- [ ] Add shift+click for range selection
- [ ] Add shift+arrow for range extension
- [ ] Implement range highlight styling
- [ ] Hook into clipboard API for multi-cell copy
- [ ] Parse clipboard data for multi-cell paste
- [ ] Handle TSV/CSV formatted clipboard data
- [ ] Add visual feedback for paste preview
- [ ] Implement `onRangeCopy` and `onRangePaste` callbacks

### 4.4 Files to modify
- `DataGrid.tsx`: Add state and handlers for range selection
- `Cell.tsx`: Add range selection styles
- `style/cell.ts`: Range highlight CSS
- `types.ts`: New type definitions
- `utils/clipboard.ts`: New file for clipboard utilities

---

## Phase 5: CSS to Tailwind Migration

### 5.1 Current styling approach
react-data-grid uses [ecij](https://github.com/nicolo-ribaudo/ecij) (CSS-in-JS with template literals) for styling.

Example current style:
```typescript
const cell = css`
  @layer rdg.Cell {
    position: absolute;
    inset-block-start: 0;
    inline-size: 100%;
    block-size: 100%;
    padding-block: 0;
    padding-inline: 8px;
    border-inline-end: 1px solid var(--rdg-border-color);
    border-block-end: 1px solid var(--rdg-border-color);
  }
`;
```

### 5.2 Migration strategy

**Option A: Full Tailwind classes (preferred for Cella consistency)**
Replace CSS-in-JS with Tailwind utility classes and custom CSS variables.

**Option B: Hybrid approach**
Keep some CSS-in-JS for complex grid layout, use Tailwind for common utilities.

### 5.3 px to rem conversion
- Base: 16px = 1rem
- Default row height: 35px → 2.1875rem
- Default cell padding: 8px → 0.5rem
- Border width: 1px → 0.0625rem (or keep as 1px for crisp lines)

### 5.4 Implementation tasks
- [ ] Create Tailwind classes for grid layout
- [ ] Create Tailwind classes for cells
- [ ] Create Tailwind classes for rows
- [ ] Create Tailwind classes for header
- [ ] Create Tailwind classes for selection states
- [ ] Update CSS variables to use rem units
- [ ] Create `data-grid.css` with base styles
- [ ] Remove ecij dependency
- [ ] Update classnames to use Tailwind merge (cn utility)

### 5.5 Tailwind class mapping

| Original CSS | Tailwind Equivalent |
|--------------|---------------------|
| `position: absolute` | `absolute` |
| `padding-inline: 8px` | `px-2` (0.5rem) |
| `border-inline-end: 1px solid` | `border-r border-border` |
| `font-size: 14px` | `text-sm` (0.875rem) |
| `background-color: var(--rdg-bg)` | `bg-background` |
| `color: var(--rdg-color)` | `text-foreground` |

### 5.6 CSS variables to keep (for theming)
```css
.rdg {
  --rdg-selection-color: hsl(var(--primary));
  --rdg-row-hover-background: hsl(var(--muted));
  --rdg-row-selected-background: hsl(var(--accent));
}
```

---

## Phase 6: Mobile Sub-Row Feature

### 6.1 Design decision
Add props for mobile-responsive row expansion:
```typescript
interface Column<R> {
  // Existing props...
  
  // New mobile props
  mobileParent?: boolean;      // This column shows in mobile primary row
  mobileSub?: boolean;         // This column shows in mobile sub-row
  mobileHidden?: boolean;      // Hide this column on mobile entirely
}

interface DataGridProps {
  // New props
  mobileBreakpoint?: number;   // Default: 768px (md breakpoint)
  enableMobileSubRows?: boolean;
  renderMobileSubRow?: (props: MobileSubRowProps) => ReactNode;
}
```

### 6.2 Behavior
1. On desktop: Normal grid behavior
2. On mobile (< breakpoint):
   - Columns with `mobileParent: true` render in main row
   - Columns with `mobileSub: true` render as expandable sub-row
   - Sub-row appears below parent row with indent
   - Auto-expand or tap-to-expand behavior

### 6.3 Implementation tasks
- [ ] Add column props for mobile configuration
- [ ] Create `useMobileLayout` hook with media query
- [ ] Create `MobileSubRow` component
- [ ] Modify `Row.tsx` to conditionally render sub-row
- [ ] Add expand/collapse state per row
- [ ] Add touch-friendly expand trigger
- [ ] Style sub-row with appropriate indentation
- [ ] Handle column filtering based on mobile props
- [ ] Add animation for expand/collapse

### 6.4 Files to create/modify
- `hooks/useMobileLayout.ts`: New hook for responsive detection
- `MobileSubRow.tsx`: New component
- `Row.tsx`: Conditional sub-row rendering
- `style/mobile.ts`: Mobile-specific styles
- `types.ts`: New type definitions

### 6.5 Example usage
```tsx
const columns: Column<User>[] = [
  { 
    key: 'name', 
    name: 'Name',
    mobileParent: true  // Always visible
  },
  { 
    key: 'email', 
    name: 'Email',
    mobileSub: true     // Shows in sub-row on mobile
  },
  { 
    key: 'role', 
    name: 'Role',
    mobileSub: true
  },
  { 
    key: 'actions', 
    name: '',
    mobileParent: true  // Action buttons visible
  }
];

<DataGrid
  columns={columns}
  rows={users}
  enableMobileSubRows
  mobileBreakpoint={768}
/>
```

---

## Phase 7: Testing & Documentation

### 7.1 Testing tasks
- [ ] Unit tests for selection modes
- [ ] Unit tests for virtualization options
- [ ] Unit tests for copy/paste functionality
- [ ] Unit tests for mobile sub-row feature
- [ ] Integration tests with Cella tables
- [ ] Visual regression tests
- [ ] Performance benchmarks vs. original

### 7.2 Documentation tasks
- [ ] Update component README
- [ ] Document new props and their usage
- [ ] Create Storybook stories for new features
- [ ] Add migration guide from react-data-grid
- [ ] Document CSS/Tailwind customization

---

## Implementation Order

Recommended order based on dependencies and impact:

1. **Phase 1** (Setup) - Foundation for everything else
2. **Phase 3** (Virtualization) - Simple prop addition, low risk
3. **Phase 2** (Selection modes) - Core functionality change
4. **Phase 5** (Tailwind) - Can be done incrementally
5. **Phase 4** (Copy/paste) - Complex feature, needs selection modes first
6. **Phase 6** (Mobile) - Independent feature, can be parallel

---

## Estimated Effort

| Phase | Effort | Risk |
|-------|--------|------|
| 1. Setup | 2-3 hours | Low |
| 2. Selection modes | 4-6 hours | Medium |
| 3. Virtualization | 2-3 hours | Low |
| 4. Copy/paste | 6-8 hours | Medium |
| 5. Tailwind migration | 8-12 hours | Medium |
| 6. Mobile sub-rows | 6-8 hours | Medium |
| 7. Testing | 4-6 hours | Low |

**Total: ~32-46 hours**

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing tables | High | Comprehensive testing, feature flags |
| Performance regression | Medium | Benchmark testing, profiling |
| Accessibility issues | Medium | ARIA attribute preservation, testing |
| Bundle size increase | Low | Tree-shaking, code splitting |
| Future upstream updates | Low | Document divergence, consider contributing back |

---

## Success Criteria

- [ ] All existing table functionality works without regression
- [ ] Selection modes work correctly (cell/row/none)
- [ ] Virtualization can be toggled per axis
- [ ] Multi-cell copy/paste works with standard clipboard
- [ ] Styles use Tailwind classes and rem units
- [ ] Mobile sub-rows display correctly on narrow screens
- [ ] Performance equal to or better than original
- [ ] All tests pass
- [ ] No accessibility regressions
