import type { Meta, StoryObj } from '@storybook/react-vite';
import { PencilIcon, TrashIcon } from 'lucide-react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { type EllipsisOption, TableEllipsis } from '~/modules/common/data-table/table-ellipsis';
import { DeleteForm } from '~/modules/common/delete-form';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';

const onDelete = fn();
const onEdit = fn();

const options: EllipsisOption<{ id: string }>[] = [
  {
    label: 'Edit',
    icon: PencilIcon,
    onSelect: () => {
      dropdowner.getState().remove();
      onEdit();
    },
  },
  {
    label: 'Delete',
    icon: TrashIcon,
    variant: 'destructive',
    confirm: () => ({
      title: 'Delete Acme?',
      content: (
        <DeleteForm
          resource="c:organization"
          pending={false}
          allowOfflineDelete
          onDelete={() => {
            onDelete();
            dropdowner.getState().remove();
          }}
        />
      ),
    }),
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

/** A table row's "…" menu: Delete turns the same menu into a confirmation that starts on Cancel, and Cancel steps back. */
const meta = {
  title: 'common/data-table/TableEllipsis',
  component: RowActions,
  parameters: { layout: 'centered' },
  beforeEach: () => {
    onDelete.mockClear();
    onEdit.mockClear();
    dropdowner.setState({ dropdown: null, lastRemovedTriggerId: null, lastRemovedAt: 0 });
  },
} satisfies Meta<typeof RowActions>;

export default meta;
type Story = StoryObj<typeof meta>;

const body = () => within(document.body);
const popup = () => document.querySelector<HTMLElement>('[data-slot="dropdown-menu-content"]');
// The confirmation ignores a press this soon after it appears
const pastArmDelay = () => new Promise((resolve) => setTimeout(resolve, 350));

export const ConfirmWithMouse: Story = {
  name: 'Delete confirms with the mouse, in the same menu',
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'));
    const menu = await body().findByRole('menu');
    await userEvent.click(await body().findByRole('menuitem', { name: /Delete/ }));

    const question = await body().findByRole('group', { name: 'Delete Acme?' });
    await waitFor(() => expect(question).toBeVisible());
    await expect(body().getByRole('menu')).toBe(menu);
    await waitFor(() => expect(body().getByRole('menuitem', { name: /cancel/i })).toHaveFocus());

    await pastArmDelay();
    await userEvent.click(body().getByRole('menuitem', { name: /delete.resource/i }));
    await expect(onDelete).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(body().queryByRole('menu')).toBeNull());
  },
};

export const ConfirmWithKeyboard: Story = {
  name: 'The keyboard moves through the confirmation, Cancel steps back, Escape closes',
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

    await body().findByRole('group', { name: 'Delete Acme?' });
    const cancel = body().getByRole('menuitem', { name: /cancel/i });
    await waitFor(() => expect(cancel).toHaveFocus());
    await userEvent.keyboard('{ArrowUp}');
    await waitFor(() => expect(document.activeElement).toHaveTextContent(/delete.resource/i));
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(cancel).toHaveFocus());

    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(body().queryByRole('group', { name: 'Delete Acme?' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Delete'));
    await expect(body().getByRole('menu')).toBe(menu);

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body().queryByRole('menu')).toBeNull());
    await expect(onDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(ellipsis).toHaveFocus());
  },
};

export const DoubleClickIsNotAConfirmation: Story = {
  name: 'A double click on Delete does not confirm',
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'));
    await userEvent.dblClick(await body().findByRole('menuitem', { name: /Delete/ }));
    await userEvent.click(await body().findByRole('menuitem', { name: /delete.resource/i }));

    await expect(onDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(body().getByRole('group', { name: 'Delete Acme?' })).toBeVisible());
  },
};

const sampleEdges = async () => {
  const rights: number[] = [];
  const widths: number[] = [];
  const start = performance.now();
  while (performance.now() - start < 400) {
    const rect = popup()?.getBoundingClientRect();
    if (rect) {
      rights.push(rect.right);
      widths.push(rect.width);
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return { rights, widths };
};

export const MorphKeepsItsCorner: Story = {
  name: 'The menu grows into the confirmation and shrinks back from the corner at its trigger',
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'));
    await body().findByRole('menu');
    // Past the menu's entry zoom, so edges are measured unscaled
    await new Promise((resolve) => setTimeout(resolve, 300));
    const menuRect = popup()?.getBoundingClientRect();

    await userEvent.click(body().getByRole('menuitem', { name: /Delete/ }));
    const grow = await sampleEdges();
    const confirmRect = popup()?.getBoundingClientRect();
    await expect(confirmRect?.width).toBeGreaterThan(menuRect?.width ?? 0);
    await expect(grow.widths.some((width) => width > (menuRect?.width ?? 0) + 1 && width < (confirmRect?.width ?? 0) - 1)).toBe(true);
    await expect(Math.max(...grow.rights) - Math.min(...grow.rights)).toBeLessThan(1.5);

    await userEvent.click(body().getByRole('menuitem', { name: /cancel/i }));
    const shrink = await sampleEdges();
    await expect(popup()?.getBoundingClientRect().width).toBeCloseTo(menuRect?.width ?? 0, 0);
    await expect(Math.max(...shrink.rights) - Math.min(...shrink.rights)).toBeLessThan(1.5);
    await expect(Math.abs((popup()?.getBoundingClientRect().right ?? 0) - (menuRect?.right ?? 0))).toBeLessThan(1.5);
  },
};
