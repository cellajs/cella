import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { type Column, DataGrid, type DataGridProps, type SelectionMode } from '../data-grid';

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

// Basic columns
const basicColumns: Column<Person>[] = [
  { key: 'firstName', name: 'First Name', width: 120 },
  { key: 'lastName', name: 'Last Name', width: 120 },
  { key: 'email', name: 'Email', width: 200 },
  { key: 'department', name: 'Department', width: 120 },
];

// Full columns with all properties
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

// Columns with responsive visibility
const responsiveColumns: Column<Person>[] = [
  { key: 'id', name: 'ID', width: 60, frozen: true },
  { key: 'firstName', name: 'First Name', width: 120 },
  { key: 'lastName', name: 'Last Name', width: 120, minBreakpoint: 'sm' },
  { key: 'email', name: 'Email', width: 200, minBreakpoint: 'md' },
  { key: 'department', name: 'Department', width: 120, minBreakpoint: 'lg' },
  { key: 'role', name: 'Role', width: 150, minBreakpoint: 'xl' },
];

// Columns with mobile sub-row support
const mobileColumns: Column<Person>[] = [
  { key: 'id', name: 'ID', width: 60 },
  { key: 'firstName', name: 'First Name', width: 120 },
  { key: 'lastName', name: 'Last Name', width: 120 },
  { key: 'email', name: 'Email', width: 200, mobileRole: 'sub', mobileLabel: 'Email Address' },
  { key: 'department', name: 'Department', width: 120, mobileRole: 'sub' },
  { key: 'role', name: 'Role', width: 150, mobileRole: 'sub', mobileLabel: 'Job Title' },
  {
    key: 'salary',
    name: 'Salary',
    width: 100,
    mobileRole: 'sub',
    renderCell: ({ row }) => `$${row.salary.toLocaleString()}`,
  },
];

// Columns with focusable control
const focusableColumns: Column<Person>[] = [
  { key: 'id', name: 'ID', width: 60, focusable: false },
  { key: 'firstName', name: 'First Name', width: 120 },
  { key: 'lastName', name: 'Last Name', width: 120 },
  { key: 'email', name: 'Email', width: 200, focusable: false },
  { key: 'department', name: 'Department', width: 120 },
];

// Columns with interactive links (used to verify none-mode accessibility behavior)
const linkColumns: Column<Person>[] = [
  { key: 'firstName', name: 'First Name', width: 140 },
  { key: 'lastName', name: 'Last Name', width: 140 },
  {
    key: 'email',
    name: 'Email link',
    width: 260,
    renderCell: ({ row }) => (
      <a
        href={`mailto:${row.email}`}
        tabIndex={0}
        onClick={(event) => event.preventDefault()}
        className="text-primary underline underline-offset-2"
      >
        {row.email}
      </a>
    ),
  },
  { key: 'department', name: 'Department', width: 140 },
];

/**
 * A high-performance data grid component with advanced features including
 * cell range selection, responsive columns, mobile sub-rows, and touch mode.
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
      description: 'Selection mode for cells and rows',
    },
    touchMode: {
      control: 'boolean',
      description: 'Enable touch-friendly mode with larger targets',
    },
    enableMobileSubRows: {
      control: 'boolean',
      description: 'Enable mobile sub-row rendering',
    },
    rowHeight: {
      control: { type: 'number', min: 25, max: 80 },
      description: 'Height of each row in pixels',
    },
    headerRowHeight: {
      control: { type: 'number', min: 25, max: 80 },
      description: 'Height of header row in pixels',
    },
    enableVirtualization: {
      control: 'boolean',
      description: 'Enable row and column virtualization',
    },
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
// Basic Stories
// ============================================================================

/**
 * Default data grid with basic columns and data.
 */
export const Default: Story = {
  args: {
    columns: basicColumns,
    rows: sampleData,
  },
};

/**
 * Full featured grid with all columns.
 */
export const FullColumns: Story = {
  args: {
    columns: fullColumns,
    rows: sampleData,
  },
};

/**
 * Empty state when no rows are provided.
 */
export const EmptyState: Story = {
  args: {
    columns: basicColumns,
    rows: [],
    renderers: {
      noRowsFallback: <div className="p-8 text-center text-muted-foreground">No data available</div>,
    },
  },
};

// ============================================================================
// Selection Mode Stories
// ============================================================================

/**
 * No selection mode - cells and rows cannot be selected.
 */
export const SelectionModeNone: Story = {
  args: {
    columns: basicColumns,
    rows: sampleData,
    selectionMode: 'none',
  },
};

/**
 * No selection mode with interactive links.
 * Grid cells are not tabbable/selectable, while links remain keyboard focusable and clickable.
 */
export const SelectionModeNoneWithLinks: Story = {
  render: (args) => (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Use Tab to focus links in the Email column. Cells are not selectable in none mode.
      </div>
      <div style={{ height: 350 }}>
        <DataGrid {...args} selectionMode="none" />
      </div>
    </div>
  ),
  args: {
    columns: linkColumns,
    rows: sampleData,
  },
};

/**
 * Single cell selection mode.
 */
export const SelectionModeCell: Story = {
  args: {
    columns: basicColumns,
    rows: sampleData,
    selectionMode: 'cell',
  },
};

/**
 * Cell range selection mode - shift+click or shift+arrow to select multiple cells.
 */
export const SelectionModeCellRange: Story = {
  render: (args) => {
    const [selectedRange, setSelectedRange] = useState<{
      start: { idx: number; rowIdx: number };
      end: { idx: number; rowIdx: number };
    } | null>(null);

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          {selectedRange
            ? `Selected: (${selectedRange.start.idx}, ${selectedRange.start.rowIdx}) to (${selectedRange.end.idx}, ${selectedRange.end.rowIdx})`
            : 'Select a cell, then use Shift+Click or Shift+Arrow keys to extend the range'}
        </div>
        <div style={{ height: 350 }}>
          <DataGrid
            {...args}
            selectionMode="cell-range"
            selectedCellRange={selectedRange}
            onSelectedCellRangeChange={({ range }) => setSelectedRange(range)}
          />
        </div>
      </div>
    );
  },
  args: {
    columns: basicColumns,
    rows: sampleData,
  },
};

/**
 * Single row selection mode.
 */
export const SelectionModeRow: Story = {
  render: (args) => {
    const [selectedRows, setSelectedRows] = useState<ReadonlySet<number>>(new Set());

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Selected: {selectedRows.size > 0 ? Array.from(selectedRows).join(', ') : 'None'}
        </div>
        <div style={{ height: 350 }}>
          <DataGrid
            {...args}
            selectionMode="row"
            selectedRows={selectedRows}
            onSelectedRowsChange={setSelectedRows}
            rowKeyGetter={(row) => row.id}
          />
        </div>
      </div>
    );
  },
  args: {
    columns: basicColumns,
    rows: sampleData,
  },
};

/**
 * Multiple row selection mode with shift+click support.
 */
export const SelectionModeRowMulti: Story = {
  render: (args) => {
    const [selectedRows, setSelectedRows] = useState<ReadonlySet<number>>(new Set());

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Selected: {selectedRows.size > 0 ? `${selectedRows.size} rows` : 'None'} - Use Shift+Click for range,
          Ctrl+Click for toggle
        </div>
        <div style={{ height: 350 }}>
          <DataGrid
            {...args}
            selectionMode="row-multi"
            selectedRows={selectedRows}
            onSelectedRowsChange={setSelectedRows}
            rowKeyGetter={(row) => row.id}
          />
        </div>
      </div>
    );
  },
  args: {
    columns: basicColumns,
    rows: sampleData,
  },
};

/**
 * Interactive selection mode switcher.
 */
export const SelectionModeSwitcher: Story = {
  render: (args) => {
    const [mode, setMode] = useState<SelectionMode>('row-multi');
    const [selectedRows, setSelectedRows] = useState<ReadonlySet<number>>(new Set());

    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['none', 'cell', 'cell-range', 'row', 'row-multi'] as SelectionMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
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
            rowKeyGetter={(row) => row.id}
          />
        </div>
      </div>
    );
  },
  args: {
    columns: basicColumns,
    rows: sampleData,
  },
};

// ============================================================================
// Mobile & Touch Stories
// ============================================================================

/**
 * Touch mode with larger touch targets.
 */
export const TouchMode: Story = {
  args: {
    columns: basicColumns,
    rows: sampleData,
    touchMode: true,
    rowHeight: 44,
  },
};

/**
 * Touch mode enabled only below md breakpoint.
 */
export const TouchModeResponsive: Story = {
  args: {
    columns: basicColumns,
    rows: sampleData,
    touchMode: { max: 'md' },
  },
};

/**
 * Mobile sub-rows with expandable details.
 */
export const MobileSubRows: Story = {
  render: (args) => {
    const [expandedRows, setExpandedRows] = useState<ReadonlySet<number>>(new Set([0]));

    return (
      <div style={{ height: 400 }}>
        <DataGrid
          {...args}
          enableMobileSubRows={true}
          expandedRows={expandedRows}
          onExpandedRowsChange={setExpandedRows}
        />
      </div>
    );
  },
  args: {
    columns: mobileColumns,
    rows: sampleData,
  },
};

/**
 * Mobile sub-rows enabled only below md breakpoint.
 */
export const MobileSubRowsResponsive: Story = {
  render: (args) => {
    const [expandedRows, setExpandedRows] = useState<ReadonlySet<number>>(new Set());

    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Resize browser below md breakpoint to see mobile sub-rows</p>
        <div style={{ height: 350 }}>
          <DataGrid
            {...args}
            enableMobileSubRows={{ max: 'md' }}
            expandedRows={expandedRows}
            onExpandedRowsChange={setExpandedRows}
          />
        </div>
      </div>
    );
  },
  args: {
    columns: mobileColumns,
    rows: sampleData,
  },
};

// ============================================================================
// Responsive Column Visibility Stories
// ============================================================================

/**
 * Columns with responsive visibility based on breakpoints.
 */
export const ResponsiveColumnVisibility: Story = {
  args: {
    columns: responsiveColumns,
    rows: sampleData,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Resize the browser to see columns appear/disappear based on breakpoints. LastName visible at sm+, Email at md+, Department at lg+, Role at xl+.',
      },
    },
  },
};

/**
 * Columns visible within a specific range.
 */
export const ColumnVisibilityRange: Story = {
  args: {
    columns: [
      { key: 'firstName', name: 'First Name (always)', width: 150 },
      { key: 'lastName', name: 'Last Name (sm-lg)', width: 150, minBreakpoint: 'sm', maxBreakpoint: 'lg' },
      { key: 'email', name: 'Email (lg+)', width: 200, minBreakpoint: 'lg' },
    ] as Column<Person>[],
    rows: sampleData,
  },
};

// ============================================================================
// Focusable Navigation Stories
// ============================================================================

/**
 * Some columns are skipped during keyboard navigation.
 */
export const FocusableColumns: Story = {
  args: {
    columns: focusableColumns,
    rows: sampleData,
  },
  parameters: {
    docs: {
      description: {
        story: 'ID and Email columns have focusable=false and will be skipped during Tab/Arrow navigation.',
      },
    },
  },
};

// ============================================================================
// Styling & Customization Stories
// ============================================================================

/**
 * Custom row height.
 */
export const CustomRowHeight: Story = {
  args: {
    columns: basicColumns,
    rows: sampleData,
    rowHeight: 50,
    headerRowHeight: 45,
  },
};

/**
 * Custom row class based on data.
 */
export const CustomRowClass: Story = {
  args: {
    columns: fullColumns,
    rows: sampleData,
    rowClass: (row) => (!row.active ? 'opacity-50' : undefined),
  },
};

/**
 * Combined touch mode and mobile sub-rows.
 */
export const MobileOptimized: Story = {
  render: (args) => {
    const [expandedRows, setExpandedRows] = useState<ReadonlySet<number>>(new Set());

    return (
      <div style={{ height: 400 }}>
        <DataGrid
          {...args}
          touchMode={{ max: 'md' }}
          enableMobileSubRows={{ max: 'md' }}
          expandedRows={expandedRows}
          onExpandedRowsChange={setExpandedRows}
          rowHeight={44}
        />
      </div>
    );
  },
  args: {
    columns: mobileColumns,
    rows: sampleData,
  },
};

// ============================================================================
// Complex Scenarios
// ============================================================================

/**
 * All features combined for comprehensive testing.
 */
export const AllFeatures: Story = {
  render: (args) => {
    const [selectedRows, setSelectedRows] = useState<ReadonlySet<number>>(new Set());
    const [expandedRows, setExpandedRows] = useState<ReadonlySet<number>>(new Set());
    const [mode, setMode] = useState<SelectionMode>('row-multi');

    return (
      <div className="space-y-4">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="flex gap-2">
            {(['none', 'cell', 'row', 'row-multi'] as SelectionMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-2 py-1 rounded text-xs ${mode === m ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            Selected: {selectedRows.size} rows | Expanded: {expandedRows.size} rows
          </span>
        </div>
        <div style={{ height: 350 }}>
          <DataGrid
            {...args}
            selectionMode={mode}
            selectedRows={selectedRows}
            onSelectedRowsChange={setSelectedRows}
            rowKeyGetter={(row) => row.id}
            enableMobileSubRows={true}
            expandedRows={expandedRows}
            onExpandedRowsChange={setExpandedRows}
          />
        </div>
      </div>
    );
  },
  args: {
    columns: mobileColumns,
    rows: sampleData,
  },
};

/**
 * Large dataset for performance testing.
 */
export const LargeDataset: Story = {
  args: {
    columns: fullColumns,
    rows: Array.from({ length: 1000 }, (_, i) => ({
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
    })),
    enableVirtualization: true,
  },
  parameters: {
    docs: {
      description: {
        story: '1000 rows with virtualization enabled for smooth scrolling.',
      },
    },
  },
};

// ============================================================================
// Interaction Tests
// ============================================================================

/**
 * Tests that clicking a cell selects it.
 */
export const ShouldSelectCellOnClick: Story = {
  name: 'when cell is clicked, should select it',
  tags: ['!dev', '!autodocs'],
  args: {
    columns: basicColumns,
    rows: sampleData,
    selectionMode: 'cell',
  },
  play: async ({ canvas, step }) => {
    await step('Click a cell to select it', async () => {
      const cell = await canvas.findByText('Alice');
      await userEvent.click(cell, { delay: 100 });
      // Cell should have selection outline
      await waitFor(() => {
        const cellElement = cell.closest('.rdg-cell');
        expect(cellElement).toHaveAttribute('aria-selected', 'true');
      });
    });
  },
};

/**
 * Tests keyboard navigation between cells.
 */
export const ShouldNavigateWithArrowKeys: Story = {
  name: 'when arrow key is pressed, should move selection',
  tags: ['!dev', '!autodocs'],
  args: {
    columns: basicColumns,
    rows: sampleData,
    selectionMode: 'cell',
  },
  play: async ({ canvas, step }) => {
    await step('Click first cell', async () => {
      const cell = await canvas.findByText('Alice');
      await userEvent.click(cell, { delay: 100 });
    });

    await step('Press ArrowRight to move to next cell', async () => {
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => {
        const johnsonCell = canvas.getByText('Johnson').closest('.rdg-cell');
        expect(johnsonCell).toHaveAttribute('aria-selected', 'true');
      });
    });
  },
};

/**
 * Tests row selection with checkbox.
 */
export const ShouldSelectRowOnClick: Story = {
  name: 'when row is clicked, should select it',
  tags: ['!dev', '!autodocs'],
  render: (args) => {
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
  args: {
    columns: basicColumns,
    rows: sampleData,
    selectionMode: 'row',
  },
  play: async ({ canvas, step }) => {
    await step('Click on a row', async () => {
      const cell = await canvas.findByText('Bob');
      await userEvent.click(cell, { delay: 100 });
      // Row should be selected
      await waitFor(() => {
        const row = cell.closest('.rdg-row');
        expect(row).toHaveAttribute('aria-selected', 'true');
      });
    });
  },
};

/**
 * Tests that non-focusable columns are skipped during navigation.
 */
export const ShouldSkipNonFocusableColumns: Story = {
  name: 'when navigating, should skip non-focusable columns',
  tags: ['!dev', '!autodocs'],
  args: {
    columns: focusableColumns,
    rows: sampleData,
    selectionMode: 'cell',
  },
  play: async ({ canvas, step }) => {
    await step('Click first focusable cell (firstName)', async () => {
      const cell = await canvas.findByText('Alice');
      await userEvent.click(cell, { delay: 100 });
    });

    await step('Press ArrowRight - should skip email and go to lastName', async () => {
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => {
        const lastNameCell = canvas.getByText('Johnson').closest('.rdg-cell');
        expect(lastNameCell).toHaveAttribute('aria-selected', 'true');
      });
    });
  },
};

/**
 * Tests mobile sub-row expansion.
 */
export const ShouldExpandMobileSubRow: Story = {
  name: 'when expand toggle is clicked, should show sub-row',
  tags: ['!dev', '!autodocs'],
  render: (args) => {
    const [expandedRows, setExpandedRows] = useState<ReadonlySet<number>>(new Set());
    return (
      <div style={{ height: 400 }}>
        <DataGrid
          {...args}
          enableMobileSubRows={true}
          expandedRows={expandedRows}
          onExpandedRowsChange={setExpandedRows}
        />
      </div>
    );
  },
  args: {
    columns: mobileColumns,
    rows: sampleData,
  },
  play: async ({ canvas, step }) => {
    await step('Click expand toggle for first row', async () => {
      const expandToggle = await canvas.findAllByRole('button', { name: /expand/i });
      if (expandToggle.length > 0) {
        await userEvent.click(expandToggle[0], { delay: 100 });
        // Should show sub-row with mobile labels
        await waitFor(() => {
          expect(canvas.queryByText('Email Address')).toBeVisible();
        });
      }
    });
  },
};
