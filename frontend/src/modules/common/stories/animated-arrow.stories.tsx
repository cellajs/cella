import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnimatedArrow } from '~/modules/common/animated-arrow';

const meta = {
  title: 'common/AnimatedArrow',
  component: AnimatedArrow,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof AnimatedArrow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <button type="button" className="group flex items-center font-medium text-sm">
        Learn more
        <Story />
      </button>
    ),
  ],
};
