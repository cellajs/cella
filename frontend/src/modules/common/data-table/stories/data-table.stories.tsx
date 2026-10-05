import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { DataTable } from '~/modules/common/data-table/data-table';
import { reorderColumn } from '~/modules/common/data-table/reorder-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';

type Row = { id: string; name: string };

const columns: ColumnOrColumnGroup<Row>[] = [{ key: 'name', name: 'Name' }];

function Table({ rows, error, isLoading }: { rows?: Row[]; error?: Error; isLoading?: boolean }) {
  return (
    <DataTable<Row> columns={columns} rows={rows} error={error} isLoading={isLoading} rowKeyGetter={(row) => row.id} hasNextPage={false} readOnly />
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

/** The reorder column: a grip a pointer drags, and a menu of single steps for every other way of working. */
export const Reorderable: Story = {
  render: function Render() {
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
            reorderColumn<Row>({ getName: (row) => row.name, onMove: (rowIdx, step) => move(rowIdx, rowIdx + step), rowCount: rows.length }),
            ...columns,
          ]}
          rows={rows}
          rowKeyGetter={(row) => row.id}
          hasNextPage={false}
          readOnly
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
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const grips = await canvas.findAllByRole('button', { name: /row$/ });

    await step('The grip names its row and marks itself as the row drag source', async () => {
      await expect(grips[0]).toHaveAccessibleName(/first row$/i);
      await expect(grips[0]).toHaveAttribute('data-drag-handle');
      await expect(grips[0]).toHaveAttribute('draggable', 'true');
    });

    await step('A key press opens the menu and lands focus inside it', async () => {
      grips[0].focus();
      await userEvent.keyboard('{Enter}');
      const menu = await body.findByRole('menu');
      await expect(menu.contains(canvasElement.ownerDocument.activeElement)).toBe(true);
    });

    await step('The first row cannot move up, and moving down puts it second', async () => {
      const menu = await body.findByRole('menu');
      await expect(within(menu).getByRole('menuitem', { name: /move.up/i })).toHaveAttribute('data-disabled');
      await userEvent.click(within(menu).getByRole('menuitem', { name: /move.down/i }));
      await expect(canvas.getByTestId('row-order')).toHaveTextContent('Second row,First row,Third row');
    });

    await step('Focus returns to the grip of the row that moved, once the menu has closed', async () => {
      const moved = await canvas.findByRole('button', { name: /first row$/i });
      await waitFor(() => expect(moved).toHaveFocus());
    });
  },
};
