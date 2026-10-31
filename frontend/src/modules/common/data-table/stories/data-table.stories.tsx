import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { DataTable } from '~/modules/common/data-table/data-table';
import { reorderColumn } from '~/modules/common/data-table/reorder-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { uiStore } from '~/modules/ui/ui-store';

type Row = { id: string; name: string };

const columns: ColumnOrColumnGroup<Row>[] = [{ key: 'name', name: 'Name' }];

function Table({ rows, error, isLoading }: { rows?: Row[]; error?: Error; isLoading?: boolean }) {
  return (
    <DataTable<Row>
      columns={columns}
      rows={rows}
      error={error}
      isLoading={isLoading}
      rowKeyGetter={(row) => row.id}
      hasNextPage={false}
      hideEndMarker
    />
  );
}

/** What a table shows for each query state: a skeleton while loading, the error of a failed first load, and rows. */
const meta = { title: 'common/data-table/DataTable', component: Table } satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: { isLoading: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  },
};

export const FailedFirstLoad: Story = {
  args: { error: new Error('Could not load the list') },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Could not load the list')).toBeVisible();
    await expect(canvasElement.querySelector('[data-slot="skeleton"]')).toBeNull();
  },
};

export const Rows: Story = {
  args: { rows: [{ id: 'r1', name: 'First row' }] },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('First row')).toBeVisible();
  },
};

const reorderableRows: Row[] = [
  { id: 'r1', name: 'First row' },
  { id: 'r2', name: 'Second row' },
  { id: 'r3', name: 'Third row' },
];

function ReorderableTable() {
  const [rows, setRows] = useState(reorderableRows);

  const move = (fromIdx: number, toIdx: number) =>
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });

  return (
    <div className="space-y-2">
      <DataTable<Row>
        columns={[
          reorderColumn<Row>({
            getId: (row) => row.id,
            getName: (row) => row.name,
            onMove: (rowIdx, step) => move(rowIdx, rowIdx + step),
            rowCount: rows.length,
          }),
          ...columns,
        ]}
        rows={rows}
        rowKeyGetter={(row) => row.id}
        hasNextPage={false}
        hideEndMarker
        enableVirtualization={false}
        onRowReorder={(fromIdx, toIdx, edge) => {
          let insertAt = edge === 'bottom' ? toIdx + 1 : toIdx;
          if (fromIdx < insertAt) insertAt -= 1;
          move(fromIdx, insertAt);
        }}
      />
      <div className="text-muted-foreground text-xs" data-testid="row-order">
        {rows.map((row) => row.name).join(',')}
      </div>
    </div>
  );
}

// The test setup loads no translations, so a grip is found through its row, not by its translated name
const gripOf = (canvasElement: HTMLElement, rowName: string) => {
  const row = within(canvasElement).getByText(rowName).closest<HTMLElement>('[role="row"]');
  if (!row) throw new Error(`No row holds ${rowName}`);
  return within(row).getByRole('button');
};

/** The reorder column in a grid that navigates cells: a grip a pointer drags, and arrow keys that move its row while it has focus. */
export const Reorderable: Story = {
  render: () => <ReorderableTable />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const order = () => canvas.getByTestId('row-order');
    await canvas.findByText('First row');

    await step('The grip is sortable and is its row drag source', async () => {
      const grip = gripOf(canvasElement, 'First row');
      await expect(grip).toHaveAttribute('aria-roledescription');
      await expect(grip).toHaveAttribute('draggable', 'true');
    });

    await step('A click focuses the grip and opens no menu', async () => {
      await userEvent.click(gripOf(canvasElement, 'First row'));
      await expect(gripOf(canvasElement, 'First row')).toHaveFocus();
      await expect(body.queryByRole('menu')).toBeNull();
    });

    await step('ArrowDown moves the row, and focus and the grid selection stay with it', async () => {
      await userEvent.keyboard('{ArrowDown}');
      await expect(order()).toHaveTextContent('Second row,First row,Third row');
      const grip = gripOf(canvasElement, 'First row');
      await waitFor(() => expect(grip).toHaveFocus());
      await expect(grip.closest('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
      await waitFor(() => expect(canvasElement.ownerDocument.querySelector('body > [role="status"]')).not.toBeEmptyDOMElement());
    });

    await step('Escape hands focus to the cell, so ArrowDown navigates the grid and moves nothing', async () => {
      await userEvent.keyboard('{Escape}');
      await expect(gripOf(canvasElement, 'First row').closest('[role="gridcell"]')).toHaveFocus();
      await userEvent.keyboard('{ArrowDown}');
      await expect(order()).toHaveTextContent('Second row,First row,Third row');
      await expect(gripOf(canvasElement, 'Third row')).toHaveFocus();
    });
  },
};

/** With increased contrast a click on the grip opens a menu of single moves, for a pointer that cannot drag. */
export const ReorderableWithMoreContrast: Story = {
  render: () => <ReorderableTable />,
  beforeEach: () => {
    uiStore.setState({ contrast: 'more' });
    return () => uiStore.setState({ contrast: 'system' });
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const order = () => canvas.getByTestId('row-order');
    await canvas.findByText('First row');

    await step('A click opens the menu, where the first row cannot move up and moving down puts it second', async () => {
      await userEvent.click(gripOf(canvasElement, 'First row'));
      const menu = await body.findByRole('menu');
      await expect(within(menu).getByRole('menuitem', { name: /move.up/i })).toHaveAttribute('data-disabled');
      await userEvent.click(within(menu).getByRole('menuitem', { name: /move.down/i }));
      await expect(order()).toHaveTextContent('Second row,First row,Third row');
    });

    await step('Focus returns to the grip of the row that moved, and its arrow keys still move it', async () => {
      const grip = gripOf(canvasElement, 'First row');
      await waitFor(() => expect(grip).toHaveFocus());
      await userEvent.keyboard('{ArrowUp}');
      await expect(order()).toHaveTextContent('First row,Second row,Third row');
      await expect(body.queryByRole('menu')).toBeNull();
    });
  },
};
