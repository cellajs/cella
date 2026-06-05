import type { Meta, StoryObj } from '@storybook/react-vite';
import { Logo } from '~/modules/marketing/logo';

const meta = {
  title: 'common/Logo',
  component: Logo,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const IconOnly: Story = {
  args: { iconOnly: true },
};

export const CustomColors: Story = {
  args: { iconColor: '#FF6B00', textColor: '#1a1a1a' },
};

export const Small: Story = {
  args: { height: 30 },
};

export const Large: Story = {
  args: { height: 80 },
};
