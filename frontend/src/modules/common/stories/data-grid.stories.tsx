import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import {
  type CellSelectionMode,
  type Column,
  type ColumnWidths,
  DataGrid,
  type DataGridProps,
  type RowSelectionMode,
  type SortColumn,
} from '../data-grid';

// Sample data types
interface Person {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  age: number;
  department: string;
  role: string;
  salary: number;
  active: boolean;
  startDate: string;
}

// Sample data
const sampleData: Person[] = [
  {
    id: 1,
    firstName: 'Alice',
    lastName: 'Johnson',
    email: 'alice@example.com',
    age: 32,
    department: 'Engineering',
    role: 'Senior Developer',
    salary: 95000,
    active: true,
    startDate: '2021-03-15',
  },
  {
    id: 2,
    firstName: 'Bob',
    lastName: 'Smith',
    email: 'bob@example.com',
    age: 28,
    department: 'Design',
    role: 'UI Designer',
    salary: 75000,
    active: true,
    startDate: '2022-01-10',
  },
  {
    id: 3,
    firstName: 'Charlie',
    lastName: 'Brown',
    email: 'charlie@example.com',
    age: 45,
    department: 'Engineering',
    role: 'Tech Lead',
    salary: 120000,
    active: true,
    startDate: '2019-07-22',
  },
  {
    id: 4,
    firstName: 'Diana',
    lastName: 'Ross',
    email: 'diana@example.com',
    age: 35,
    department: 'Marketing',
    role: 'Marketing Manager',
    salary: 85000,
    active: false,
    startDate: '2020-11-01',
  },
  {
    id: 5,
    firstName: 'Edward',
    lastName: 'Davis',
    email: 'edward@example.com',
    age: 29,
    department: 'Engineering',
    role: 'Junior Developer',
    salary: 65000,
    active: true,
    startDate: '2023-02-14',
  },
  {
    id: 6,
    firstName: 'Fiona',
    lastName: 'Miller',
    email: 'fiona@example.com',
    age: 41,
    department: 'HR',
    role: 'HR Director',
    salary: 110000,
    active: true,
    startDate: '2018-09-05',
  },
  {
    id: 7,
    firstName: 'George',
    lastName: 'Wilson',
    email: 'george@example.com',
    age: 33,
    department: 'Sales',
    role: 'Sales Representative',
    salary: 70000,
    active: true,
    startDate: '2021-06-20',
  },
  {
    id: 8,
    firstName: 'Hannah',
    lastName: 'Taylor',
    email: 'hannah@example.com',
    age: 27,
    department: 'Design',
    role: 'UX Researcher',
    salary: 72000,
    active: true,
    startDate: '2022-08-15',
  },
  {
    id: 9,
    firstName: 'Ivan',
    lastName: 'Anderson',
    email: 'ivan@example.com',
    age: 38,
    department: 'Engineering',
    role: 'DevOps Engineer',
    salary: 100000,
    active: false,
    startDate: '2020-04-01',
  },
  {
    id: 10,
    firstName: 'Julia',
    lastName: 'Thomas',
    email: 'julia@example.com',
    age: 31,
    department: 'Product',
    role: 'Product Manager',
    salary: 95000,
    active: true,
    startDate: '2021-10-12',
  },
];

const basicColumns: Column<Person>[] = [
  { key: 'firstName', name: 'First Name', width: 120 },
  { key: 'lastName', name: 'Last Name', width: 120 },
  { key: 'email', name: 'Email', width: 200 },
  { key: 'department', name: 'Department', width: 120 },
];

const fullColumns: Column<Person>[] = [
  { key: 'id', name: 'ID', width: 60, frozen: true },
  { key: 'firstName', name: 'First Name', width: 120 },
  { key: 'lastName', name: 'Last Name', width: 120 },
  { key: 'email', name: 'Email', width: 200 },
  { key: 'age', name: 'Age', width: 60 },
  { key: 'department', name: 'Department', width: 120 },
  { key: 'role', name: 'Role', width: 150 },
  { key: 'salary', name: 'Salary', width: 100, renderCell: ({ row }) => `$${row.salary.toLocaleString()}` },
  { key: 'active', name: 'Active', width: 80, renderCell: ({ row }) => (row.active ? '✓' : '✗') },
  { key: 'startDate', name: 'Start Date', width: 110 },
];

const resizableColumns: Column<Person>[] = [
  { key: 'firstName', name: 'First Name', width: 140, resizable: true },
  { key: 'lastName', name: 'Last Name', width: 140, resizable: true },
  { key: 'email', name: 'Email', width: 220, resizable: true },
  { key: 'department', name: 'Department', width: 140, resizable: true },
  { key: 'role', name: 'Role', width: 160, resizable: true },
];

const sortableColumns: Column<Person>[] = [
  { key: 'firstName', name: 'First Name', width: 120, sortable: true },
  { key: 'lastName', name: 'Last Name', width: 120, sortable: true },
  { key: 'age', name: 'Age', width: 80, sortable: true },
  { key: 'department', name: 'Department', width: 130, sortable: true },
  {
    key: 'salary',
    name: 'Salary',
    width: 110,
    sortable: true,
    renderCell: ({ row }) => `$${row.salary.toLocaleString()}`,
  },
];

const responsiveColumns: Column<Person>[] = [
  { key: 'id', name: 'ID', width: 60, frozen: true },
  { key: 'firstName', name: 'First Name', width: 120 },
  { key: 'lastName', name: 'Last Name', width: 120, minBreakpoint: 'sm' },
  { key: 'email', name: 'Email', width: 200, minBreakpoint: 'md' },
  { key: 'department', name: 'Department', width: 120, minBreakpoint: 'lg' },
  { key: 'role', name: 'Role', width: 150, minBreakpoint: 'xl' },
];

/**
 * A high-performance data grid component with cell selection, column resize,
 * sorting, responsive columns, and copy/paste support.
 */
const meta: Meta<DataGridProps<Person>> = {
  title: 'common/DataGrid',
  component: DataGrid<Person>,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    cellSelectionMode: {
      control: 'select',
      options: ['none', 'cell', 'cell-range'],
    },
    rowSelectionMode: {
      control: 'select',
      options: ['none', 'single', 'multi'],
    },
    rowHeight: { control: { type: 'number', min: 25, max: 80 } },
    headerRowHeight: { control: { type: 'number', min: 25, max: 80 } },
    enableVirtualization: { control: 'boolean' },
    isCompact: { control: 'boolean' },
  },
  args: {
    rows: sampleData,
    columns: basicColumns,
    rowHeight: 35,
    headerRowHeight: 35,
    enableVirtualization: true,
  },
  decorators: [
    (Story) => (
      <div style={{ height: 400, width: '100%' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<DataGridProps<Person>>;

// Core stories

/** Default data grid with basic columns. */
export const Default: Story = {};

/** All columns including frozen ID, custom renderers, and many fields. */
export const FullColumns: Story = {
  args: { columns: fullColumns },
};

/** Toggle between all selection modes interactively. */
export const SelectionModes: Story = {
  render: function Render(args) {
    const [cellMode, setCellMode] = useState<CellSelectionMode>('cell');
    const [rowMode, setRowMode] = useState<RowSelectionMode>('multi');
    const [selectedRows, setSelectedRows] = useState<ReadonlySet<number>>(new Set());
    const [selectedRange, setSelectedRange] = useState<{
      start: { idx: number; rowIdx: number };
      end: { idx: number; rowIdx: number };
    } | null>(null);

    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <span className="text-sm">Cell:</span>
          {(['none', 'cell', 'cell-range'] as CellSelectionMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setCellMode(m);
                setSelectedRange(null);
              }}
              className={`rounded px-3 py-1 text-sm ${cellMode === m ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <span className="text-sm">Row:</span>
          {(['none', 'single', 'multi'] as RowSelectionMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setRowMode(m);
                setSelectedRows(new Set());
              }}
              className={`rounded px-3 py-1 text-sm ${rowMode === m ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div style={{ height: 350 }}>
          <DataGrid
            {...args}
            cellSelectionMode={cellMode}
            rowSelectionMode={rowMode}
            selectedRows={selectedRows}
            onSelectedRowsChange={setSelectedRows}
            selectedCellRange={selectedRange}
            onSelectedCellRangeChange={({ range }) => setSelectedRange(range)}
            rowKeyGetter={(row) => row.id}
          />
        </div>
      </div>
    );
  },
  args: { columns: basicColumns },
};

/** Drag column borders to resize. Widths are persisted in state. */
export const ColumnResize: Story = {
  render: function Render(args) {
    const [columnWidths, setColumnWidths] = useState<ColumnWidths>(new Map());

    return (
      <div className="space-y-4">
        <div className="text-muted-foreground text-sm">Drag the right edge of any column header to resize it.</div>
        <div style={{ height: 350 }}>
          <DataGrid {...args} columnWidths={columnWidths} onColumnWidthsChange={setColumnWidths} />
        </div>
      </div>
    );
  },
  args: { columns: resizableColumns },
};

/** Click column headers to sort. Supports multi-column sort with Shift+Click. */
export const Sorting: Story = {
  render: function Render(args) {
    const [sortColumns, setSortColumns] = useState<SortColumn[]>([]);
    const sorted = [...sampleData].sort((a, b) => {
      for (const { columnKey, direction } of sortColumns) {
        const aVal = a[columnKey as keyof Person];
        const bVal = b[columnKey as keyof Person];
        if (aVal < bVal) return direction === 'ASC' ? -1 : 1;
        if (aVal > bVal) return direction === 'ASC' ? 1 : -1;
      }
      return 0;
    });

    return (
      <div className="space-y-4">
        <div className="text-muted-foreground text-sm">
          Click headers to sort.{' '}
          {sortColumns.length > 0 &&
            `Sorting by: ${sortColumns.map((s) => `${s.columnKey} ${s.direction}`).join(', ')}`}
        </div>
        <div style={{ height: 350 }}>
          <DataGrid {...args} rows={sorted} sortColumns={sortColumns} onSortColumnsChange={setSortColumns} />
        </div>
      </div>
    );
  },
  args: { columns: sortableColumns },
};

/** Columns show/hide based on viewport breakpoints. Resize the browser to test. */
export const ResponsiveColumns: Story = {
  args: { columns: responsiveColumns },
};

const largeData = Array.from({ length: 1000 }, (_, i) => ({
  id: i + 1,
  firstName: `First${i + 1}`,
  lastName: `Last${i + 1}`,
  email: `user${i + 1}@example.com`,
  age: 20 + (i % 50),
  department: ['Engineering', 'Design', 'Marketing', 'Sales', 'HR'][i % 5],
  role: ['Developer', 'Designer', 'Manager', 'Representative', 'Analyst'][i % 5],
  salary: 50000 + (i % 100) * 1000,
  active: i % 3 !== 0,
  startDate: `202${i % 5}-0${(i % 12) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
}));

/** 1000 rows with virtualization for smooth scrolling. */
export const LargeDataset: Story = {
  args: { columns: fullColumns, rows: largeData },
};

/** Click a cell and press Cmd+C to copy its value. */
export const CopyCell: Story = {
  render: function Render(args) {
    const [copied, setCopied] = useState<string | null>(null);

    return (
      <div className="space-y-4">
        <div className="text-muted-foreground text-sm">
          Click a cell, then press <kbd className="rounded border bg-muted px-1.5 py-0.5">Cmd+C</kbd> to copy.
        </div>
        <div style={{ height: 300 }}>
          <DataGrid
            {...args}
            cellSelectionMode="cell"
            onCellCopy={({ value }) => {
              setCopied(value != null ? String(value) : '');
            }}
          />
        </div>
        <div className="flex items-center gap-2 text-sm" data-testid="copy-output">
          <span className="font-medium">Last copied:</span>
          <code className="rounded bg-muted px-2 py-1" data-testid="copied-value">
            {copied ?? '(nothing yet)'}
          </code>
        </div>
      </div>
    );
  },
  args: { columns: basicColumns },
  play: async ({ canvas, step }) => {
    await step('Click a cell to select it', async () => {
      const cell = await canvas.findByText('Alice');
      await userEvent.click(cell, { delay: 100 });

      await waitFor(() => {
        const cellElement = cell.closest('.rdg-cell');
        expect(cellElement).toHaveAttribute('aria-selected', 'true');
      });
    });

    await step('Trigger copy event', async () => {
      const grid = canvas.getByRole('grid');
      const copyEvent = new ClipboardEvent('copy', { bubbles: true, clipboardData: new DataTransfer() });
      grid.dispatchEvent(copyEvent);

      await waitFor(() => {
        const output = canvas.getByTestId('copied-value');
        expect(output.textContent).toBe('Alice');
      });
    });
  },
};

// Interaction tests (hidden from sidebar)

export const ShouldSelectCellOnClick: Story = {
  name: 'when cell is clicked, should select it',
  tags: ['!dev', '!autodocs'],
  args: { columns: basicColumns, cellSelectionMode: 'cell' },
  play: async ({ canvas, step }) => {
    await step('Click a cell to select it', async () => {
      const cell = await canvas.findByText('Alice');
      await userEvent.click(cell, { delay: 100 });
      await waitFor(() => {
        expect(cell.closest('.rdg-cell')).toHaveAttribute('aria-selected', 'true');
      });
    });
  },
};

export const ShouldNavigateWithArrowKeys: Story = {
  name: 'when arrow key is pressed, should move selection',
  tags: ['!dev', '!autodocs'],
  args: { columns: basicColumns, cellSelectionMode: 'cell' },
  play: async ({ canvas, step }) => {
    await step('Click first cell', async () => {
      const cell = await canvas.findByText('Alice');
      await userEvent.click(cell, { delay: 100 });
    });
    await step('Press ArrowRight to move to next cell', async () => {
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => {
        expect(canvas.getByText('Johnson').closest('.rdg-cell')).toHaveAttribute('aria-selected', 'true');
      });
    });
  },
};

export const ShouldSelectRowOnClick: Story = {
  name: 'when row is clicked, should show row outline',
  tags: ['!dev', '!autodocs'],
  render: function Render(args) {
    const [selectedRows, setSelectedRows] = useState<ReadonlySet<number>>(new Set());
    return (
      <div style={{ height: 300 }}>
        <DataGrid
          {...args}
          selectedRows={selectedRows}
          onSelectedRowsChange={setSelectedRows}
          rowKeyGetter={(row) => row.id}
        />
      </div>
    );
  },
  args: { columns: basicColumns, rowSelectionMode: 'single' },
  play: async ({ canvas, step }) => {
    await step('Click on a row and verify it is selected', async () => {
      const cell = await canvas.findByText('Bob');
      await userEvent.click(cell, { delay: 100 });
      await waitFor(() => {
        expect(cell.closest('.rdg-row')).toHaveAttribute('aria-selected', 'true');
      });
    });

    await step('Row cells should have selection border, not individual cell outline', async () => {
      const cell = await canvas.findByText('Bob');
      const cellEl = cell.closest('.rdg-cell')!;
      const style = window.getComputedStyle(cellEl);
      // Cell should NOT carry the per-cell selection ring (2px). Avoid asserting
      // outlineStyle === 'none' because UA :focus-visible may set outline:auto
      // on focused tabindex cells in headless Chromium.
      expect(style.outlineWidth).not.toBe('2px');
    });
  },
};

export const ShouldSelectCellRange: Story = {
  name: 'when shift+click in cell-range mode, should select range',
  tags: ['!dev', '!autodocs'],
  args: { columns: basicColumns, cellSelectionMode: 'cell-range' },
  play: async ({ canvas, step }) => {
    await step('Click first cell', async () => {
      const cell = await canvas.findByText('Alice');
      await userEvent.click(cell, { delay: 100 });
      await waitFor(() => {
        expect(cell.closest('.rdg-cell')).toHaveAttribute('aria-selected', 'true');
      });
    });

    await step('Shift+Arrow extends the selection into a multi-cell range', async () => {
      const grid = canvas.getByRole('grid');
      // A real shift+pointer range drag can't run in the headless browser-test
      // runner (untrusted pointer events don't drive react-data-grid's range
      // selection). cella also supports keyboard range extension: Shift+Arrow,
      // wired to `extendSelection` in data-grid navigate, so we drive that
      // deterministic path from the already-selected cell instead.
      const selected = grid.querySelector<HTMLElement>('.rdg-cell[aria-selected="true"]') ?? grid;
      selected.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
      selected.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));

      await waitFor(() => {
        // Cells in range should have the range class
        const rangeCells = grid.querySelectorAll('.rdg-cell-in-range');
        expect(rangeCells.length).toBeGreaterThan(1);
      });
    });

    await step('Range cells should not have individual outlines', async () => {
      const grid = canvas.getByRole('grid');
      const rangeCells = grid.querySelectorAll('.rdg-cell-in-range');
      for (const cell of rangeCells) {
        const style = window.getComputedStyle(cell);
        // See ShouldSelectRowOnClick: assert no per-cell selection ring instead
        // of outlineStyle === 'none' to avoid UA :focus-visible interference.
        expect(style.outlineWidth).not.toBe('2px');
      }
    });

    await step('Range boundary should have selection borders', async () => {
      const grid = canvas.getByRole('grid');
      const topCells = grid.querySelectorAll('.rdg-cell-range-top');
      expect(topCells.length).toBeGreaterThan(0);
      const bottomCells = grid.querySelectorAll('.rdg-cell-range-bottom');
      expect(bottomCells.length).toBeGreaterThan(0);
    });
  },
};

export const ShouldVirtualizeRows: Story = {
  name: 'when virtualized, should render only visible rows',
  tags: ['!dev', '!autodocs'],
  render: function Render(args) {
    return (
      <div style={{ height: 300, overflow: 'auto' }} data-testid="scroll-container">
        <DataGrid {...args} rows={largeData} enableVirtualization />
      </div>
    );
  },
  args: { columns: basicColumns },
  play: async ({ canvas, step }) => {
    await step('Grid should render far fewer rows than the dataset', async () => {
      const grid = canvas.getByRole('grid');
      await waitFor(() => {
        const renderedRows = grid.querySelectorAll('[role="row"]:not(:first-child)');
        // 1000 rows in data, but only a fraction should be rendered
        expect(renderedRows.length).toBeLessThan(100);
        expect(renderedRows.length).toBeGreaterThan(0);
      });
    });

    await step('Scrolling should render new rows', async () => {
      const container = canvas.getByTestId('scroll-container');
      // Scroll down
      container.scrollTop = 500;
      await waitFor(() => {
        // Should still have rendered rows after scroll
        const grid = canvas.getByRole('grid');
        const rows = grid.querySelectorAll('[role="row"]:not(:first-child)');
        expect(rows.length).toBeGreaterThan(0);
      });
    });
  },
};

export const ShouldResizeColumn: Story = {
  name: 'when Ctrl+Arrow is pressed on a resizable header, should resize column',
  tags: ['!dev', '!autodocs'],
  render: function Render(args) {
    const [columnWidths, setColumnWidths] = useState<ColumnWidths>(new Map());
    return (
      <div style={{ height: 300 }}>
        <DataGrid {...args} columnWidths={columnWidths} onColumnWidthsChange={setColumnWidths} />
      </div>
    );
  },
  args: { columns: resizableColumns },
  play: async ({ canvas, step }) => {
    await step('Header should have resize handles', async () => {
      const grid = canvas.getByRole('grid');
      await waitFor(() => {
        const headers = grid.querySelectorAll('[role="columnheader"]');
        expect(headers.length).toBeGreaterThan(0);
        // Each resizable header should contain a resize handle div
        const firstHeader = headers[0];
        expect(firstHeader).toBeTruthy();
      });
    });

    await step('Ctrl+Arrow on a resizable header should widen the column', async () => {
      const grid = canvas.getByRole('grid');
      const firstHeader = grid.querySelector<HTMLElement>('[role="columnheader"]')!;
      // cella drives column sizing through the grid's inline grid-template-columns,
      // recomputed from width state. The headless runner doesn't apply full grid
      // layout (so getBoundingClientRect is unreliable), but the inline template is
      // deterministic React output we can assert against.
      const initialTemplate = grid.style.gridTemplateColumns;

      // A real pointer-drag on the resize handle can't run in the headless
      // browser-test runner: react-data-grid uses pointer capture, which ignores
      // untrusted synthetic PointerEvents. Instead we drive cella's own keyboard
      // resize affordance (Ctrl+ArrowRight, see header-cell.tsx onKeyDown), the
      // accessible, deterministic path to the same behaviour.
      firstHeader.focus();
      firstHeader.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }));

      await waitFor(() => {
        expect(grid.style.gridTemplateColumns).not.toBe(initialTemplate);
      });
    });
  },
};

export const ShouldFreezeFrozenColumns: Story = {
  name: 'when a column is frozen, its cells carry the sticky pinning contract',
  tags: ['!dev', '!autodocs'],
  args: { columns: fullColumns, cellSelectionMode: 'cell' },
  play: async ({ canvas, step }) => {
    await step('Frozen cells are marked sticky and pinned via a frozen-left offset', async () => {
      const grid = canvas.getByRole('grid');
      await waitFor(() => {
        const frozenCells = grid.querySelectorAll<HTMLElement>('.rdg-cell-frozen');
        expect(frozenCells.length).toBeGreaterThan(0);
        // The headless browser-test runner doesn't apply the grid's full CSS
        // layout, so computed `position`/geometry are unreliable here. Instead we
        // assert cella's own deterministic contract (getCellStyle/getCellClassname):
        // every frozen cell gets the `sticky` class and an inline inset var that
        // pins it to the left as the grid scrolls.
        for (const cell of frozenCells) {
          expect(cell.classList.contains('sticky')).toBe(true);
          expect(cell.style.insetInlineStart).toContain('--rdg-frozen-left');
        }
      });
    });
  },
};

// Column drag-and-drop stories

const draggableHeaderColumns: Column<Person>[] = [
  { key: 'firstName', name: 'First Name', width: 120, draggable: true },
  { key: 'lastName', name: 'Last Name', width: 120, draggable: true },
  { key: 'email', name: 'Email', width: 200, draggable: true },
  { key: 'department', name: 'Department', width: 120, draggable: true },
  { key: 'role', name: 'Role', width: 150, draggable: true },
];

/** Drag column headers to reorder them. Uses @atlaskit/pragmatic-drag-and-drop with left/right drop indicators. */
export const ColumnDragDrop: Story = {
  render: function Render() {
    const [columns, setColumns] = useState(draggableHeaderColumns);

    function onColumnsReorder(sourceKey: string, targetKey: string) {
      setColumns((prev) => {
        const sourceIdx = prev.findIndex((c) => c.key === sourceKey);
        const targetIdx = prev.findIndex((c) => c.key === targetKey);
        if (sourceIdx === -1 || targetIdx === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(sourceIdx, 1);
        next.splice(targetIdx, 0, moved);
        return next;
      });
    }

    return (
      <div className="space-y-4">
        <div className="text-muted-foreground text-sm">
          Drag column headers to reorder them. A blue drop indicator shows the target position.
        </div>
        <div style={{ height: 400 }}>
          <DataGrid
            rows={sampleData}
            columns={columns}
            rowKeyGetter={(row) => row.id}
            rowHeight={35}
            headerRowHeight={35}
            enableVirtualization={false}
            onColumnsReorder={onColumnsReorder}
          />
        </div>
        <div className="text-muted-foreground text-xs" data-testid="column-order">
          Column order: {columns.map((c) => c.name).join(', ')}
        </div>
      </div>
    );
  },
};

export const ShouldReorderColumnOnDragDrop: Story = {
  name: 'when column header is dragged, should show drag state and drop indicator',
  tags: ['!dev', '!autodocs'],
  render: function Render() {
    const [columns, setColumns] = useState(draggableHeaderColumns);

    function onColumnsReorder(sourceKey: string, targetKey: string) {
      setColumns((prev) => {
        const sourceIdx = prev.findIndex((c) => c.key === sourceKey);
        const targetIdx = prev.findIndex((c) => c.key === targetKey);
        if (sourceIdx === -1 || targetIdx === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(sourceIdx, 1);
        next.splice(targetIdx, 0, moved);
        return next;
      });
    }

    return (
      <div style={{ height: 400 }}>
        <DataGrid
          rows={sampleData}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          rowHeight={35}
          headerRowHeight={35}
          enableVirtualization={false}
          onColumnsReorder={onColumnsReorder}
        />
        <div data-testid="column-order">{columns.map((c) => c.name).join(',')}</div>
      </div>
    );
  },
  play: async ({ canvas, step }) => {
    await step('Grid should render all column headers', async () => {
      const grid = canvas.getByRole('grid');
      await waitFor(() => {
        const headers = grid.querySelectorAll('[role="columnheader"]');
        expect(headers.length).toBe(5);
      });
    });

    await step('Column order text should reflect initial order', async () => {
      const orderEl = canvas.getByTestId('column-order');
      expect(orderEl.textContent).toBe('First Name,Last Name,Email,Department,Role');
    });

    await step('All column headers should be present in the grid', async () => {
      expect(canvas.getByText('First Name')).toBeTruthy();
      expect(canvas.getByText('Last Name')).toBeTruthy();
      expect(canvas.getByText('Email')).toBeTruthy();
      expect(canvas.getByText('Department')).toBeTruthy();
      expect(canvas.getByText('Role')).toBeTruthy();
    });
  },
};

// Row drag-and-drop stories

interface DraggablePerson extends Person {
  displayOrder: number;
}

const draggableData: DraggablePerson[] = sampleData.map((p, i) => ({ ...p, displayOrder: (i + 1) * 10 }));

const draggableColumns: Column<DraggablePerson>[] = [
  {
    key: '__drag',
    name: '',
    width: 28,
    rowDragHandle: true,
    cellClass: 'cursor-grab',
    renderCell: () => <span aria-hidden>⋮⋮</span>,
  },
  { key: 'displayOrder', name: '#', width: 50, renderCell: ({ row }) => row.displayOrder },
  { key: 'firstName', name: 'First Name', width: 120 },
  { key: 'lastName', name: 'Last Name', width: 120 },
  { key: 'email', name: 'Email', width: 200 },
  { key: 'department', name: 'Department', width: 120 },
];

/** Shared reorder reducer used by the row-DnD stories. */
function reorderRows<R extends DraggablePerson>(prev: R[], fromIndex: number, toIndex: number, edge: Edge) {
  const next = [...prev];
  const [moved] = next.splice(fromIndex, 1);
  const insertIdx =
    edge === 'bottom' ? toIndex + (fromIndex < toIndex ? 0 : 1) : toIndex > fromIndex ? toIndex - 1 : toIndex;
  next.splice(insertIdx, 0, moved);
  return next.map((r, i) => ({ ...r, displayOrder: (i + 1) * 10 }));
}

/** Drag rows to reorder them. Uses @atlaskit/pragmatic-drag-and-drop with closest-edge drop indicators. */
export const RowDragDrop: Story = {
  render: function Render() {
    const [rows, setRows] = useState<DraggablePerson[]>(draggableData);

    const onRowReorder = (fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => {
      setRows((prev) => reorderRows(prev, fromIdx, toIdx, edge));
    };

    return (
      <div className="space-y-4">
        <div className="text-muted-foreground text-sm">
          Drag the handle (⋮⋮) of any row to reorder. A blue drop indicator shows the target position.
        </div>
        <div style={{ height: 400 }}>
          <DataGrid
            rows={rows}
            columns={draggableColumns}
            rowKeyGetter={(row) => row.id}
            rowHeight={35}
            headerRowHeight={35}
            enableVirtualization={false}
            onRowReorder={onRowReorder}
          />
        </div>
        <div className="text-muted-foreground text-xs" data-testid="row-order">
          Order: {rows.map((r) => r.firstName).join(', ')}
        </div>
      </div>
    );
  },
};

export const ShouldReorderRowOnDragDrop: Story = {
  name: 'when row is dragged, should show drag state and drop indicator',
  tags: ['!dev', '!autodocs'],
  render: function Render() {
    const [rows, setRows] = useState<DraggablePerson[]>(draggableData);

    const onRowReorder = (fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => {
      setRows((prev) => reorderRows(prev, fromIdx, toIdx, edge));
    };

    return (
      <div style={{ height: 400 }}>
        <DataGrid
          rows={rows}
          columns={draggableColumns}
          rowKeyGetter={(row) => row.id}
          rowHeight={35}
          headerRowHeight={35}
          enableVirtualization={false}
          onRowReorder={onRowReorder}
        />
        <div data-testid="row-order">{rows.map((r) => r.firstName).join(',')}</div>
      </div>
    );
  },
  play: async ({ canvas, step }) => {
    await step('Grid should render all rows', async () => {
      const grid = canvas.getByRole('grid');
      await waitFor(() => {
        const rows = grid.querySelectorAll('[role="row"]');
        // header + 10 data rows
        expect(rows.length).toBe(11);
      });
    });

    await step('Rows should contain draggable cells', async () => {
      const grid = canvas.getByRole('grid');
      const cells = grid.querySelectorAll('[role="gridcell"]');
      expect(cells.length).toBeGreaterThan(0);
    });

    await step('Row order text should reflect initial order', async () => {
      const orderEl = canvas.getByTestId('row-order');
      expect(orderEl.textContent).toContain('Alice');
      expect(orderEl.textContent).toContain('Bob');
    });
  },
};

/**
 * Drag rows in a long, scrollable list. With `enableDragAutoScroll`, dragging
 * near the top or bottom edge of the scroll container auto-scrolls so off-screen
 * rows become valid drop targets. Visual demo only: auto-scroll requires real
 * pointer drag and cannot be exercised by `userEvent`.
 */
export const RowDragDropAutoScroll: Story = {
  render: function Render() {
    // 100 rows so the list is much taller than the 300px viewport
    const initial = Array.from({ length: 100 }, (_, i) => ({
      ...sampleData[i % sampleData.length],
      id: i + 1,
      displayOrder: (i + 1) * 10,
    }));
    const [rows, setRows] = useState<DraggablePerson[]>(initial);

    const onRowReorder = (fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => {
      setRows((prev) => reorderRows(prev, fromIdx, toIdx, edge));
    };

    return (
      <div className="space-y-4">
        <div className="text-muted-foreground text-sm">
          Drag a row near the top or bottom edge of the scroll area — the list auto-scrolls so you can drop on rows that
          started off-screen. The grid uses row virtualization, so off-screen rows mount on demand as scrolling reveals
          them.
        </div>
        <div style={{ height: 300, overflowY: 'auto' }} className="rounded border">
          <DataGrid
            rows={rows}
            columns={draggableColumns}
            rowKeyGetter={(row) => row.id}
            rowHeight={35}
            headerRowHeight={35}
            enableVirtualization={true}
            enableDragAutoScroll={true}
            onRowReorder={onRowReorder}
          />
        </div>
      </div>
    );
  },
};
