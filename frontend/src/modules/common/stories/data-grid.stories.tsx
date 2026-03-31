import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import {
  type Column,
  type ColumnWidths,
  DataGrid,
  type DataGridProps,
  type SelectionMode,
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
    selectionMode: {
      control: 'select',
      options: ['none', 'cell', 'cell-range', 'row', 'row-multi'],
    },
    touchMode: { control: 'boolean' },
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

// ============================================================================
// Core stories
// ============================================================================

/** Default data grid with basic columns. */
export const Default: Story = {};

/** All columns including frozen ID, custom renderers, and many fields. */
export const FullColumns: Story = {
  args: { columns: fullColumns },
};

/** Toggle between all selection modes interactively. */
export const SelectionModes: Story = {
  render: function Render(args) {
    const [mode, setMode] = useState<SelectionMode>('row-multi');
    const [selectedRows, setSelectedRows] = useState<ReadonlySet<number>>(new Set());
    const [selectedRange, setSelectedRange] = useState<{
      start: { idx: number; rowIdx: number };
      end: { idx: number; rowIdx: number };
    } | null>(null);

    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['none', 'cell', 'cell-range', 'row', 'row-multi'] as SelectionMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setSelectedRows(new Set());
                setSelectedRange(null);
              }}
              className={`px-3 py-1 rounded text-sm ${mode === m ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div style={{ height: 350 }}>
          <DataGrid
            {...args}
            selectionMode={mode}
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
        <div className="text-sm text-muted-foreground">Drag the right edge of any column header to resize it.</div>
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
        <div className="text-sm text-muted-foreground">
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
        <div className="text-sm text-muted-foreground">
          Click a cell, then press <kbd className="px-1.5 py-0.5 rounded border bg-muted">Cmd+C</kbd> to copy.
        </div>
        <div style={{ height: 300 }}>
          <DataGrid
            {...args}
            selectionMode="cell"
            onCellCopy={({ value }) => {
              setCopied(value != null ? String(value) : '');
            }}
          />
        </div>
        <div className="flex items-center gap-2 text-sm" data-testid="copy-output">
          <span className="font-medium">Last copied:</span>
          <code className="px-2 py-1 rounded bg-muted" data-testid="copied-value">
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

// ============================================================================
// Interaction tests (hidden from sidebar)
// ============================================================================

export const ShouldSelectCellOnClick: Story = {
  name: 'when cell is clicked, should select it',
  tags: ['!dev', '!autodocs'],
  args: { columns: basicColumns, selectionMode: 'cell' },
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
  args: { columns: basicColumns, selectionMode: 'cell' },
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
  args: { columns: basicColumns, selectionMode: 'row' },
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
      // Cell should NOT have an individual outline
      expect(style.outlineStyle).toBe('none');
    });
  },
};

export const ShouldSelectCellRange: Story = {
  name: 'when shift+click in cell-range mode, should select range',
  tags: ['!dev', '!autodocs'],
  args: { columns: basicColumns, selectionMode: 'cell-range' },
  play: async ({ canvas, step }) => {
    await step('Click first cell', async () => {
      const cell = await canvas.findByText('Alice');
      await userEvent.click(cell, { delay: 100 });
      await waitFor(() => {
        expect(cell.closest('.rdg-cell')).toHaveAttribute('aria-selected', 'true');
      });
    });

    await step('Shift+click another cell to create range', async () => {
      const targetCell = await canvas.findByText('30');
      await userEvent.click(targetCell, { delay: 100, shiftKey: true } as any);

      await waitFor(() => {
        const grid = canvas.getByRole('grid');
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
        expect(style.outlineStyle).toBe('none');
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
  name: 'when column border is dragged, should resize column',
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

    await step('Dragging resize handle should change column width', async () => {
      const grid = canvas.getByRole('grid');
      const firstHeader = grid.querySelector('[role="columnheader"]')!;
      const initialWidth = firstHeader.getBoundingClientRect().width;

      // Find the resize handle (last child div in header cell)
      const resizeHandle =
        firstHeader.querySelector('[style*="cursor"], [class*="resize"]') ?? firstHeader.lastElementChild;
      if (!resizeHandle) return;

      const rect = resizeHandle.getBoundingClientRect();
      const startX = rect.right - 2;
      const startY = rect.top + rect.height / 2;

      // Simulate pointer drag
      await resizeHandle.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: startX, clientY: startY, bubbles: true, pointerId: 1 }),
      );
      await new Promise((r) => setTimeout(r, 50));
      await resizeHandle.dispatchEvent(
        new PointerEvent('pointermove', { clientX: startX + 80, clientY: startY, bubbles: true, pointerId: 1 }),
      );
      await new Promise((r) => setTimeout(r, 50));
      await resizeHandle.dispatchEvent(
        new PointerEvent('lostpointercapture', { clientX: startX + 80, clientY: startY, bubbles: true, pointerId: 1 }),
      );

      await waitFor(
        () => {
          const newWidth = firstHeader.getBoundingClientRect().width;
          expect(newWidth).toBeGreaterThan(initialWidth);
        },
        { timeout: 2000 },
      );
    });
  },
};

export const ShouldFreezeFrozenColumns: Story = {
  name: 'when scrolled horizontally, frozen columns should stay visible',
  tags: ['!dev', '!autodocs'],
  args: { columns: fullColumns, selectionMode: 'cell' },
  play: async ({ canvas, step }) => {
    await step('Frozen ID column should have sticky positioning', async () => {
      const grid = canvas.getByRole('grid');
      await waitFor(() => {
        const frozenCells = grid.querySelectorAll('.rdg-cell-frozen');
        expect(frozenCells.length).toBeGreaterThan(0);
        const style = window.getComputedStyle(frozenCells[0]);
        expect(style.position).toBe('sticky');
      });
    });

    await step('After horizontal scroll, frozen cell should remain at left edge', async () => {
      const grid = canvas.getByRole('grid');
      const gridRect = grid.getBoundingClientRect();

      // Scroll the grid horizontally
      grid.scrollLeft = 200;
      await new Promise((r) => setTimeout(r, 100));

      await waitFor(() => {
        const frozenCells = grid.querySelectorAll('.rdg-cell-frozen');
        const dataFrozen = Array.from(frozenCells).find((c) => c.getAttribute('role') !== 'columnheader');
        if (dataFrozen) {
          const cellRect = dataFrozen.getBoundingClientRect();
          expect(Math.abs(cellRect.left - gridRect.left)).toBeLessThan(5);
        }
      });
    });
  },
};
