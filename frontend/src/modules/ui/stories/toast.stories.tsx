import type { Meta, StoryObj } from '@storybook/react-vite';
import { action } from 'storybook/actions';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { toaster, toastManager } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';
import { Toaster } from '~/modules/ui/toast';

/**
 * A stack of toasts built on Base UI Toast. Repeating a message refreshes the open toast.
 */
const meta: Meta<typeof Toaster> = {
  title: 'ui/Toast',
  component: Toaster,
  tags: ['autodocs'],
  argTypes: {
    position: { control: 'inline-radio', options: ['top', 'bottom'] },
  },
  args: { position: 'bottom' },
  parameters: { layout: 'fullscreen' },
  render: (args) => (
    <div className="flex min-h-96 flex-wrap items-center justify-center gap-2">
      <Button
        onClick={() => {
          const id = toaster('Event has been created', {
            description: new Date().toLocaleString(),
            actionProps: {
              children: 'Undo',
              onClick: () => {
                action('Undo clicked')();
                toaster.close(id);
              },
            },
          });
        }}
      >
        Show toast
      </Button>
      <Button variant="outline" onClick={() => toaster.success('Changes saved')}>
        Success
      </Button>
      <Button variant="outline" onClick={() => toaster.info('Two attachments were kept')}>
        Info
      </Button>
      <Button variant="outline" onClick={() => toaster.warning('You are offline')}>
        Warning
      </Button>
      <Button variant="outline" onClick={() => toaster.error('Something went wrong')}>
        Error
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toaster.error('The form is invalid', {
            description: (
              <div>
                <p>Name: required</p>
                <p>Email: not a valid address</p>
              </div>
            ),
          })
        }
      >
        Form errors
      </Button>
      <Toaster {...args} toastManager={toastManager} />
    </div>
  ),
} satisfies Meta<typeof Toaster>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the toaster.
 */
export const Default: Story = {};

/**
 * On small screens the app stacks toasts from the top edge.
 */
export const Top: Story = { args: { position: 'top' } };

export const ShouldShowToast: Story = {
  name: 'when repeating the same toast, should keep one toast',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvasElement, step }) => {
    const canvasBody = within(canvasElement.ownerDocument.body);
    const triggerBtn = await canvasBody.findByRole('button', { name: 'Success' });

    await step('create a toast', async () => {
      await userEvent.click(triggerBtn);
      await waitFor(() => expect(canvasBody.queryByRole('dialog')).toBeInTheDocument());
    });

    await step('create more toasts', async () => {
      await userEvent.click(triggerBtn);
      await userEvent.click(triggerBtn);
      await waitFor(() => expect(canvasBody.getAllByRole('dialog')).toHaveLength(1));
    });
  },
};

export const ShouldCloseToast: Story = {
  name: 'when clicking the action, should close the toast',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvasElement, step }) => {
    const canvasBody = within(canvasElement.ownerDocument.body);
    const triggerBtn = await canvasBody.findByRole('button', { name: /show toast/i });

    await step('create a toast', async () => {
      await userEvent.click(triggerBtn);
    });

    await step('close the toast', async () => {
      await userEvent.click(await canvasBody.findByRole('button', { name: /undo/i }));
      await waitFor(() => expect(canvasBody.queryByRole('dialog')).not.toBeInTheDocument());
    });
  },
};
