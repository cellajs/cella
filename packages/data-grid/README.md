# @cella/data-grid

A forked and enhanced version of [react-data-grid](https://github.com/adazzle/react-data-grid) with additional features for Cella applications.

## Features

This fork adds the following enhancements over the original react-data-grid:

### Selection Modes
Control row selection behavior with the `selectionMode` prop:
- `'none'` - Selection disabled
- `'single'` - Only one row can be selected at a time
- `'multi'` - Multiple rows can be selected (default behavior)

```tsx
<DataGrid
  columns={columns}
  rows={rows}
  selectionMode="single"
  selectedRows={selectedRows}
  onSelectedRowsChange={setSelectedRows}
/>
```

### Virtualization Control
Disable virtualization for printing or when working with small datasets:

```tsx
<DataGrid
  columns={columns}
  rows={rows}
  enableRowVirtualization={false}
  enableColumnVirtualization={false}
/>
```

### Copy/Paste Support
The `useCopyPaste` hook provides clipboard operations:

```tsx
import { useCopyPaste } from '@cella/data-grid';

const { handleCopy, handlePaste, copyToClipboard, pasteFromClipboard } = useCopyPaste({
  selectedPosition,
  rows,
  columns,
  onCopy: ({ row, column, rowIdx, value }) => {
    console.log('Copied:', value);
  },
  onPaste: ({ row, column, rowIdx, pastedValue }) => {
    return { ...row, [column.key]: pastedValue };
  },
  onRowChange: (rowIdx, row) => {
    // Update your rows state
  },
});
```

### Responsive Columns
The `useResponsiveColumns` hook manages column visibility based on screen width:

```tsx
import { useResponsiveColumns, type ResponsiveColumn } from '@cella/data-grid';

const columns: ResponsiveColumn<Row>[] = [
  { key: 'id', name: 'ID' },
  { key: 'name', name: 'Name' },
  { key: 'email', name: 'Email', minBreakpoint: 'md' }, // Hidden on mobile
  { key: 'phone', name: 'Phone', minBreakpoint: 'lg', showInDetail: true },
];

const { visibleColumns, hiddenColumns, currentBreakpoint } = useResponsiveColumns({
  columns,
});

// Use visibleColumns in DataGrid, render hiddenColumns in an expanded detail view
```

### Expandable Rows
The `useExpandableRows` hook manages expandable row state:

```tsx
import { useExpandableRows } from '@cella/data-grid';

const { isRowExpanded, toggleRowExpanded, expandAll, collapseAll } = useExpandableRows({
  getRowKey: (row) => row.id,
});

// Use in your row renderer
const renderRow = (row) => (
  <>
    <Row onClick={() => toggleRowExpanded(row)} />
    {isRowExpanded(row) && <RowDetail row={row} />}
  </>
);
```

### Tailwind CSS Integration
CSS uses Tailwind CSS variables for theming:

```css
/* The grid uses these CSS variables */
--primary, --primary-foreground
--background, --foreground
--border, --muted, --muted-foreground
--accent, --accent-foreground
--destructive
```

## Installation

This package is included in the Cella monorepo. Import from:

```tsx
import { DataGrid, type Column } from '@cella/data-grid';
import '@cella/data-grid/styles.css';
```

## API Reference

### DataGrid Props

All original react-data-grid props are supported, plus:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `selectionMode` | `'none' \| 'single' \| 'multi'` | `'multi'` | Row selection mode |
| `enableRowVirtualization` | `boolean` | `true` | Enable row virtualization |
| `enableColumnVirtualization` | `boolean` | `true` | Enable column virtualization |

### Hooks

- `useCopyPaste` - Clipboard copy/paste operations
- `useExpandableRows` - Expandable row state management
- `useResponsiveColumns` - Responsive column visibility
- `useRowSelection` - Row selection state (from original)
- `useHeaderRowSelection` - Header selection checkbox (from original)

## License

MIT - Same as react-data-grid
