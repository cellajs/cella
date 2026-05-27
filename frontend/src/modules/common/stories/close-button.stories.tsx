import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CloseButton } from '~/modules/common/close-button';

const meta = {
  title: 'common/CloseButton',
  component: CloseButton,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { onClick: fn() },
} satisfies Meta<typeof CloseButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: { size: 'sm' },
};

export const Medium: Story = {
  args: { size: 'md' },
};

export const Large: Story = {
  args: { size: 'lg' },
};

export const AllSizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-4">
      <CloseButton {...args} size="sm" />
      <CloseButton {...args} size="md" />
      <CloseButton {...args} size="lg" />
    </div>
  ),
};
