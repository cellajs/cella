import type { Meta, StoryObj } from '@storybook/react-vite';
import { PencilIcon, TrashIcon } from 'lucide-react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { TableEllipsis } from '~/modules/common/data-table/table-ellipsis';
import { DeleteForm } from '~/modules/common/delete-form';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { openPopConfirm } from '~/modules/common/popconfirm';

const onDelete = fn();
const onEdit = fn();

const options = [
  {
    label: 'Edit',
    icon: PencilIcon,
    onSelect: () => {
      useDropdowner.getState().remove();
      onEdit();
    },
  },
  {
    label: 'Delete',
    icon: TrashIcon,
    onSelect: () => {
      const remove = () => useDropdowner.getState().remove();
      openPopConfirm(
        'Delete Acme?',
        <DeleteForm
          pending={false}
          allowOfflineDelete
          onDelete={() => {
            onDelete();
            remove();
          }}
          onCancel={remove}
        />,
      );
    },
  },
];

function RowActions() {
  return (
    <>
      <TableEllipsis row={{ id: 'acme' }} tabIndex={0} options={options} />
      <Dropdowner />
    </>
  );
}

/** A table row's "…" menu: Delete turns the menu into a confirmation panel on the same button, starting on Cancel. */
const meta = {
  title: 'common/data-table/TableEllipsis',
  component: RowActions,
  parameters: { layout: 'centered' },
  beforeEach: () => {
    onDelete.mockClear();
    onEdit.mockClear();
    useDropdowner.setState({ dropdown: null, lastRemovedTriggerId: null, lastRemovedAt: 0 });
  },
} satisfies Meta<typeof RowActions>;

export default meta;
type Story = StoryObj<typeof meta>;

const body = () => within(document.body);

export const ConfirmWithMouse: Story = {
  name: 'Delete confirms with the mouse',
  play: async ({ canvasElement }) => {
    const ellipsis = within(canvasElement).getByRole('button');
    await userEvent.click(ellipsis);
    await userEvent.click(await body().findByRole('menuitem', { name: /Delete/ }));

    const title = await body().findByText('Delete Acme?');
    await waitFor(() => expect(title).toBeVisible());
    await expect(body().queryByRole('menu')).toBeNull();
    await waitFor(() => expect(body().getByRole('button', { name: /cancel/i })).toHaveFocus());

    await userEvent.click(body().getByRole('button', { name: /delete/i }));
    await expect(onDelete).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(body().queryByText('Delete Acme?')).toBeNull());
  },
};

export const ConfirmWithKeyboard: Story = {
  name: 'Delete confirms with the keyboard, and Escape cancels',
  play: async ({ canvasElement }) => {
    const ellipsis = within(canvasElement).getByRole('button');
    ellipsis.focus();
    await userEvent.keyboard('{Enter}');
    const menu = await body().findByRole('menu');
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Edit'));
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Delete'));
    await userEvent.keyboard('{Enter}');

    const title = await body().findByText('Delete Acme?');
    await waitFor(() => expect(title).toBeVisible());
    const cancel = body().getByRole('button', { name: /cancel/i });
    await waitFor(() => expect(cancel).toHaveFocus());

    // Focus stays inside the confirmation while tabbing.
    await userEvent.keyboard('{Tab}');
    await expect(body().getByRole('button', { name: /delete/i })).toHaveFocus();
    await userEvent.keyboard('{Tab}');
    await expect(cancel).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body().queryByText('Delete Acme?')).toBeNull());
    await expect(onDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(ellipsis).toHaveFocus());
  },
};
