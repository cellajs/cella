import type { Meta, StoryObj } from '@storybook/react-vite';
import { SimpleHeader } from '~/modules/common/simple-header';

const meta = {
  title: 'common/SimpleHeader',
  component: SimpleHeader,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SimpleHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    heading: 'Page title',
    text: 'This is a description of the page content.',
  },
};

export const HeadingOnly: Story = {
  args: { heading: 'Settings' },
};

export const WithChildren: Story = {
  args: {
    heading: 'Members',
    text: 'Manage your organization members.',
    children: <span className="text-muted-foreground text-xs">12 members</span>,
  },
};
