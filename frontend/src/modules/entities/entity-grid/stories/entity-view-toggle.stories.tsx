import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { EntityViewToggle } from '~/modules/entities/entity-grid/entity-view-toggle';
import { withApp } from '~/stories/with-app';

/** The grid/table toggle of a channel list. It writes the `view` search param, and one view always stays active. */
const meta = {
  title: 'entities/EntityViewToggle',
  component: EntityViewToggle,
  decorators: [withApp],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof EntityViewToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ShouldSwitchView: Story = {
  name: 'when clicking a view, should switch to it and keep it on a second click',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const grid = await canvas.findByRole('button', { name: /grid/i });
    const table = canvas.getByRole('button', { name: /table/i });

    await step('grid is active without a view in the URL', async () => {
      await expect(grid).toHaveAttribute('aria-pressed', 'true');
    });

    await step('click table to switch', async () => {
      await userEvent.click(table);
      await waitFor(() => expect(table).toHaveAttribute('aria-pressed', 'true'));
      await expect(grid).toHaveAttribute('aria-pressed', 'false');
    });

    await step('click table again: it stays active', async () => {
      await userEvent.click(table);
      await expect(table).toHaveAttribute('aria-pressed', 'true');
    });
  },
};

export const TableFromUrl: Story = {
  name: 'with view=table in the URL, should show table as active',
  tags: ['!dev', '!autodocs'],
  parameters: { app: { url: '/?view=table' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: /table/i })).toHaveAttribute('aria-pressed', 'true');
  },
};
