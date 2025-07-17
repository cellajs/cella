import type { Meta, StoryObj } from '@storybook/react-vite';
import { toast } from 'sonner';
import { action } from 'storybook/actions';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { Button } from '~/modules/ui/button';
import { Toaster } from '~/modules/ui/sonner';

/**
 * An opinionated toast component for React.
 */
const meta: Meta<typeof Toaster> = {
  title: 'ui/Sonner',
  component: Toaster,
  tags: ['autodocs'],
  argTypes: {},
  args: {
    position: 'bottom-right',
  },
  parameters: {
    layout: 'fullscreen',
  },
  render: (args) => (
    <div className="flex min-h-96 items-center justify-center space-x-2">
      <Button
        onClick={() =>
          toast('Event has been created', {
            description: new Date().toLocaleString(),
            action: {
              label: 'Undo',
              onClick: action('Undo clicked'),
            },
          })
        }
      >
        Show Toast
      </Button>
      <Toaster {...args} />
    </div>
  ),
} satisfies Meta<typeof Toaster>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the toaster.
 */
export const Default: Story = {};

export const ShouldShowToast: Story = {
  name: 'when clicking Show Toast button, should show a toast',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvasElement, step }) => {
    const canvasBody = within(canvasElement.ownerDocument.body);
    const triggerBtn = await canvasBody.findByRole('button', {
      name: /show/i,
    });

    await step('create a toast', async () => {
      await userEvent.click(triggerBtn);
      await waitFor(() => expect(canvasBody.queryByRole('listitem')).toBeInTheDocument());
    });

    await step('create more toasts', async () => {
      await userEvent.click(triggerBtn);
      await userEvent.click(triggerBtn);
      await waitFor(() => expect(canvasBody.getAllByRole('listitem')).toHaveLength(3));
    });
  },
};

export const ShouldCloseToast: Story = {
  name: 'when clicking the close button, should close the toast',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvasElement, step }) => {
    const canvasBody = within(canvasElement.ownerDocument.body);
    const triggerBtn = await canvasBody.findByRole('button', {
      name: /show/i,
    });

    await step('create a toast', async () => {
      await userEvent.click(triggerBtn);
    });

    await step('close the toast', async () => {
      await userEvent.click(await canvasBody.findByRole('button', { name: /undo/i }));
      await waitFor(() => expect(canvasBody.queryByRole('listitem')).not.toBeInTheDocument());
    });
  },
};
