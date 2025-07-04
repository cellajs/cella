import type { Meta, StoryObj } from '@storybook/react-vite';

import { Separator } from '../separator';

/**
 * Visually or semantically separates content.
 */
const meta = {
  title: 'ui/Separator',
  component: Separator,
  tags: ['autodocs'],
  argTypes: {},
} satisfies Meta<typeof Separator>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * A separator between horizontal items.
 */
export const Horizontal: Story = {
  render: () => (
    <div className="flex h-12 items-center justify-center gap-2">
      <div>Left</div>
      <Separator orientation="vertical" />
      <div>Right</div>
    </div>
  ),
};

/**
 * A separator between vertical items.
 */
export const Vertical: Story = {
  render: () => (
    <div className="flex flex-col items-center justify-center gap-2">
      <div>Top</div>
      <Separator orientation="horizontal" />
      <div>Bottom</div>
    </div>
  ),
};
