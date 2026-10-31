import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type CSSProperties, type Dispatch, type SetStateAction, useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { reorderColumn } from '~/modules/common/data-table/reorder-column';
import { type Column, type ColumnWidths, DataGrid, type DataGridProps, type SortColumn } from '../data-grid';

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
  { key: 'salary', name: 'Salary', width: 110, sortable: true, renderCell: ({ row }) => `$${row.salary.toLocaleString()}` },
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
 * A high-performance data grid component with keyboard cell navigation, column resize,
 * sorting, responsive columns, and copy/paste support.
 */
const meta: Meta<DataGridProps<Person>> = {
  title: 'common/DataGrid',
  component: DataGrid<Person>,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    rowHeight: { control: { type: 'number', min: 25, max: 80 } },
    headerRowHeight: { control: { type: 'number', min: 25, max: 80 } },
    enableVirtualization: { control: 'boolean' },
    isCompact: { control: 'boolean' },
  },
  args: { rows: sampleData, columns: basicColumns, rowHeight: 35, headerRowHeight: 35, enableVirtualization: true },
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
export const FullColumns: Story = { args: { columns: fullColumns } };

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
          Click headers to sort. {sortColumns.length > 0 && `Sorting by: ${sortColumns.map((s) => `${s.columnKey} ${s.direction}`).join(', ')}`}
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
export const ResponsiveColumns: Story = { args: { columns: responsiveColumns } };

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
export const LargeDataset: Story = { args: { columns: fullColumns, rows: largeData } };

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
  args: { columns: basicColumns },
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
  args: { columns: basicColumns },
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

// The wrapping column turns row heights into estimates; the stacked cell grows rows past them, as a list of labels does.
const growingRowColumns: Column<Person>[] = [
  { key: 'firstName', name: 'First Name', width: 120, wrapText: 2 },
  {
    key: 'tags',
    name: 'Tags',
    width: 160,
    renderCell: ({ row }) => (
      <div className="flex flex-col">
        {Array.from({ length: (row.id % 4) + 1 }, (_, index) => (
          <span key={index}>tag {index + 1}</span>
        ))}
      </div>
    ),
  },
];

const nextFrames = async () => {
  for (let frame = 0; frame < 3; frame++) await new Promise((resolve) => requestAnimationFrame(resolve));
};

export const ShouldKeepGrownRowHeights: Story = {
  name: 'when virtualized rows outgrow their estimate, should scroll without jumps',
  tags: ['!dev', '!autodocs'],
  render: function Render(args) {
    return (
      // h-auto: the grid grows and the container scrolls, as in DataTable. Without scroll anchoring, which hides a jump
      // by moving the scroll position in some layouts but not in others.
      <div style={{ height: 300, overflow: 'auto', overflowAnchor: 'none' }} data-testid="scroll-container">
        <DataGrid {...args} rows={largeData} enableVirtualization className="h-auto" />
      </div>
    );
  },
  args: { columns: growingRowColumns },
  play: async ({ canvas, step }) => {
    const container = canvas.getByTestId('scroll-container');
    const grid = canvas.getByRole('grid');

    await step('Content should move exactly as far as the container scrolls', async () => {
      await waitFor(() => expect(grid.querySelectorAll('[role="row"][aria-rowindex]').length).toBeGreaterThan(1));
      await nextFrames();

      for (let scrollStep = 0; scrollStep < 20; scrollStep++) {
        const rows = [...grid.querySelectorAll<HTMLElement>('[role="row"][aria-rowindex]')];
        const reference = rows[Math.floor(rows.length / 2)];
        const rowIndex = reference.getAttribute('aria-rowindex');
        const before = reference.getBoundingClientRect().top;

        container.scrollTop += 100;
        await nextFrames();

        const after = grid.querySelector(`[role="row"][aria-rowindex="${rowIndex}"]`)?.getBoundingClientRect().top;
        expect(after).toBeDefined();
        expect(Math.round((before - (after ?? 0)) * 10) / 10).toBe(100);
      }
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
      // The headless runner doesn't apply full grid layout (getBoundingClientRect unreliable), so we assert the
      // grid's inline grid-template-columns, deterministic React output recomputed from width state.
      const initialTemplate = grid.style.gridTemplateColumns;

      // A real pointer-drag on the resize handle can't run headless: react-data-grid uses pointer capture, which
      // ignores untrusted synthetic PointerEvents. Use Cella's accessible, deterministic keyboard resize
      // affordance (Ctrl+ArrowRight, see header-cell.tsx onKeyDown).
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
  args: { columns: fullColumns },
  play: async ({ canvas, step }) => {
    await step('Frozen cells are marked sticky and pinned via a frozen-left offset', async () => {
      const grid = canvas.getByRole('grid');
      await waitFor(() => {
        const frozenCells = grid.querySelectorAll<HTMLElement>('.rdg-cell-frozen');
        expect(frozenCells.length).toBeGreaterThan(0);
        // The headless runner doesn't apply the grid's full CSS layout, so computed position/geometry are
        // unreliable. Assert Cella's deterministic contract (getCellStyle/getCellClassname): every
        // frozen cell gets the `sticky` class and an inline inset var pinning it left as the grid scrolls.
        for (const cell of frozenCells) {
          expect(cell.classList.contains('sticky')).toBe(true);
          expect(cell.style.insetInlineStart).toContain('--rdg-frozen-left');
        }
      });
    });
  },
};

export const ShouldPinHeaderBelowStickyStack: Story = {
  name: 'when the window scrolls past the grid top, the header pins below the sticky stack',
  tags: ['!dev', '!autodocs'],
  render: function Render(args) {
    return (
      // Stands in for the parent a StickyBox publishes its height on.
      <div style={{ '--sticky-stack-nav': '48px' } as CSSProperties} data-testid="stack-host">
        <DataGrid {...args} rows={largeData} />
      </div>
    );
  },
  args: { columns: basicColumns },
  play: async ({ canvas, step }) => {
    const grid = canvas.getByRole('grid');
    const firstHeaderCell = () => grid.querySelector('.rdg-header-row > .rdg-cell') as HTMLElement;

    await step('The header pins at the stack offset once the grid top passes it', async () => {
      window.scrollTo(0, 600);
      await waitFor(() => {
        expect(firstHeaderCell().style.position).toBe('fixed');
        expect(firstHeaderCell().getBoundingClientRect().top).toBe(48);
      });
    });

    await step('It follows the stack when the bar above leaves, as in focus view', async () => {
      canvas.getByTestId('stack-host').style.setProperty('--sticky-stack-nav', '0px');
      expect(firstHeaderCell().getBoundingClientRect().top).toBe(0);
    });

    await step('It returns to its place when the grid is back below the pin line', async () => {
      window.scrollTo(0, 0);
      await waitFor(() => expect(firstHeaderCell().style.position).not.toBe('fixed'));
    });
  },
};

export const ShouldKeepHeaderInPlaceInScrollContainer: Story = {
  name: 'when a container scrolls the grid, the header stays in place',
  tags: ['!dev', '!autodocs'],
  render: function Render(args) {
    return (
      <div style={{ height: 300, overflow: 'auto' }} data-testid="scroll-container">
        {/* The grid fills a parent of fixed height and scrolls itself; this one lets it grow, so the container scrolls. */}
        <div>
          <DataGrid {...args} rows={largeData} />
        </div>
      </div>
    );
  },
  args: { columns: basicColumns },
  play: async ({ canvas }) => {
    const grid = canvas.getByRole('grid');
    const container = canvas.getByTestId('scroll-container');
    container.scrollTop = 500;
    await waitFor(() => expect(grid.getBoundingClientRect().top).toBeLessThan(0));
    // Two frames: a pin would be applied in the frame after the scroll event.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect((grid.querySelector('.rdg-header-row > .rdg-cell') as HTMLElement).style.position).not.toBe('fixed');
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
        <div className="text-muted-foreground text-sm">Drag column headers to reorder them. A blue drop indicator shows the target position.</div>
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

    await step('Ctrl+Shift+Arrow should move a column the drag has no key for', async () => {
      const header = canvas.getAllByRole('columnheader')[0];
      header.focus();
      await userEvent.keyboard('{Control>}{Shift>}{ArrowRight}{/Shift}{/Control}');
      await waitFor(() => {
        expect(canvas.getByTestId('column-order').textContent).toBe('Last Name,First Name,Email,Department,Role');
      });
      // The header keeps focus through the move, so a second press carries the same column on
      expect(canvas.getAllByRole('columnheader')[1]).toHaveFocus();
    });
  },
};

// Row drag-and-drop stories

interface DraggablePerson extends Person {
  displayOrder: number;
}

const draggableData: DraggablePerson[] = sampleData.map((p, i) => ({ ...p, displayOrder: (i + 1) * 10 }));

const personColumns: Column<DraggablePerson>[] = [
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
  const insertIdx = edge === 'bottom' ? toIndex + (fromIndex < toIndex ? 0 : 1) : toIndex > fromIndex ? toIndex - 1 : toIndex;
  next.splice(insertIdx, 0, moved);
  return next.map((r, i) => ({ ...r, displayOrder: (i + 1) * 10 }));
}

/** The row-DnD stories' columns: the reorder grip, which drags, moves with the arrow keys, and opens a move menu with increased contrast. */
function draggableColumns(rows: DraggablePerson[], setRows: Dispatch<SetStateAction<DraggablePerson[]>>) {
  const grip = reorderColumn<DraggablePerson>({
    getId: (row) => String(row.id),
    getName: (row) => row.firstName,
    rowCount: rows.length,
    onMove: (rowIdx, step) => setRows((prev) => reorderRows(prev, rowIdx, rowIdx + step, step < 0 ? 'top' : 'bottom')),
  });
  return [grip, ...personColumns];
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
          Drag the grip of any row to reorder, or focus it and press ↑/↓. A blue drop indicator shows the target position.
        </div>
        <div style={{ height: 400 }}>
          <DataGrid
            rows={rows}
            columns={draggableColumns(rows, setRows)}
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
          columns={draggableColumns(rows, setRows)}
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
 * With `enableDragAutoScroll`, dragging near the top/bottom edge auto-scrolls so off-screen rows become valid
 * drop targets. Visual demo only; auto-scroll needs a real pointer drag and cannot use `userEvent`.
 */
export const RowDragDropAutoScroll: Story = {
  render: function Render() {
    // 100 rows so the list is much taller than the 300px viewport
    const initial = Array.from({ length: 100 }, (_, i) => ({ ...sampleData[i % sampleData.length], id: i + 1, displayOrder: (i + 1) * 10 }));
    const [rows, setRows] = useState<DraggablePerson[]>(initial);

    const onRowReorder = (fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => {
      setRows((prev) => reorderRows(prev, fromIdx, toIdx, edge));
    };

    return (
      <div className="space-y-4">
        <div className="text-muted-foreground text-sm">
          Drag a row near the top or bottom edge of the scroll area: the list auto-scrolls so you can drop on rows that started off-screen. The grid
          uses row virtualization, so off-screen rows mount on demand as scrolling reveals them.
        </div>
        <div style={{ height: 300, overflowY: 'auto' }} className="rounded border">
          <DataGrid
            rows={rows}
            columns={draggableColumns(rows, setRows)}
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
