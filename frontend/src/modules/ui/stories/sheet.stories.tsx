import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '~/modules/ui/sheet';

/**
 * Extends the Dialog component to display content that complements the main
 * content of the screen.
 */
const meta: Meta<typeof SheetContent> = {
  title: 'ui/Sheet',
  component: Sheet,
  tags: ['autodocs'],
  argTypes: {
    side: {
      options: ['top', 'bottom', 'left', 'right'],
      control: {
        type: 'radio',
      },
    },
  },
  args: {
    side: 'right',
  },
  render: (args) => (
    <Sheet>
      <SheetTrigger>Open</SheetTrigger>
      <SheetContent {...args}>
        <SheetHeader>
          <SheetTitle>Are you absolutely sure?</SheetTitle>
          <SheetDescription>
            This action cannot be undone. This will permanently delete your account and remove your data from our servers.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose className="hover:underline">Cancel</SheetClose>
          <SheetClose className="bg-primary text-primary-foreground rounded px-4 py-2">Submit</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof SheetContent>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the sheet.
 */
export const Default: Story = {};

export const ShouldOpenCloseWithSubmit: Story = {
  name: 'when clicking Submit button, should close the sheet',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvasElement, step }) => {
    const canvasBody = within(canvasElement.ownerDocument.body);

    await step('open the sheet', async () => {
      await userEvent.click(await canvasBody.findByRole('button', { name: /open/i }));
      const sheet = await canvasBody.findByRole('dialog');
      expect(sheet).toBeInTheDocument();
      expect(sheet).toHaveAttribute('data-state', 'open');
    });

    await step('close the sheet', async () => {
      await userEvent.click(await canvasBody.findByRole('button', { name: /submit/i }));
      expect(await canvasBody.findByRole('dialog')).toHaveAttribute('data-state', 'closed');
    });
  },
};

export const ShouldOpenCloseWithCancel: Story = {
  name: 'when clicking Cancel button, should close the sheet',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvasElement, step }) => {
    const canvasBody = within(canvasElement.ownerDocument.body);

    await step('open the sheet', async () => {
      await userEvent.click(await canvasBody.findByRole('button', { name: /open/i }));
      const sheet = await canvasBody.findByRole('dialog');
      expect(sheet).toBeInTheDocument();
      expect(sheet).toHaveAttribute('data-state', 'open');
    });

    await step('close the sheet', async () => {
      await userEvent.click(await canvasBody.findByRole('button', { name: /cancel/i }));
      expect(await canvasBody.findByRole('dialog')).toHaveAttribute('data-state', 'closed');
    });
  },
};

export const ShouldOpenCloseWithClose: Story = {
  name: 'when clicking Close icon, should close the sheet',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvasElement, step }) => {
    const canvasBody = within(canvasElement.ownerDocument.body);

    await step('open the sheet', async () => {
      await userEvent.click(await canvasBody.findByRole('button', { name: /open/i }));
      const sheet = await canvasBody.findByRole('dialog');
      expect(sheet).toBeInTheDocument();
      expect(sheet).toHaveAttribute('data-state', 'open');
    });

    await step('close the sheet', async () => {
      await userEvent.click(await canvasBody.findByRole('button', { name: /close/i }));
      expect(await canvasBody.findByRole('dialog')).toHaveAttribute('data-state', 'closed');
    });
  },
};
