import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { DataTable } from '~/modules/common/data-table/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';

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
      readOnly
    />
  );
}

/** What a table shows for each query state: a skeleton while loading, the error of a failed first load, and rows. */
const meta = {
  title: 'common/data-table/DataTable',
  component: Table,
} satisfies Meta<typeof Table>;

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
